import { loadConfig } from '../config/index.js'
import { AttendanceService } from '../core/attendance/service.js'
import { AuthService } from '../core/auth/service.js'
import { SchedulerService } from '../core/scheduler/service.js'
import { ProfileRepository } from '../core/profiles/repository.js'
import { StateStore } from '../core/state/store.js'
import { CodeStore } from '../core/codes/store.js'
import { CodeWatchService } from '../core/codes/service.js'
import { CompositeNotifier } from '../core/notifications/composite.js'
import type { Notifier } from '../core/notifications/types.js'
import { EndfieldClient } from '../integrations/endfield/client.js'
import { EndfieldAuthClient } from '../integrations/endfield/auth.js'
import { DiscordNotifier } from '../integrations/discord/notifier.js'
import { TelegramNotifier } from '../integrations/telegram/notifier.js'
import {
  buildCodeDiscoveryBatchEmbed,
  buildCodeDiscoveryEmbed,
  buildCodesListEmbed,
  buildCodeWatchRunEmbed,
  buildRunEmbed,
  buildStatusEmbed,
} from '../integrations/discord/format.js'
import { AVAILABLE_CODE_SOURCE_IDS, resolveCodeSources } from '../integrations/codes/sources/index.js'
import { configureLogger, logger } from '../utils/logger.js'
import type { RunResult } from '../types/index.js'

export class App {
  async start(): Promise<void> {
    const config = loadConfig()
    await configureLogger({
      level: config.LOG_LEVEL,
      summaryPath: config.logSummaryPath,
      detailPath: config.logDetailPath,
    })
    logger.info('App starting')
    logger.debug('App config', {
      dataPath: config.DATA_PATH,
      profilePath: config.profilePath,
      cronSchedule: config.CRON_SCHEDULE,
      tokenRefreshCron: config.TOKEN_REFRESH_CRON,
      codeWatchEnabled: config.CODE_WATCH_ENABLED,
      codeWatchMode: config.CODE_WATCH_MODE,
      codeWatchCron: config.CODE_WATCH_CRON,
      codeWatchStartupScan: config.CODE_WATCH_STARTUP_SCAN,
      codeWatchSources: config.codeWatchSourceIds,
      telegramPollingEnabled: config.TELEGRAM_POLLING_ENABLED,
      telegramNotificationsDisabled: config.TELEGRAM_DISABLE_NOTIFICATION,
      telegramAllowedChats: config.telegramAllowedChatIds.length,
      timezone: config.TZ ?? 'Asia/Shanghai',
      logLevel: config.LOG_LEVEL,
      logSummaryPath: config.logSummaryPath,
      logDetailPath: config.logDetailPath,
    })
    const profileRepository = new ProfileRepository(config.profilePath)
    const profilesFile = await profileRepository.load()
    const profiles = profilesFile.profiles
    const stateStore = new StateStore(config.DATA_PATH)
    const state = await stateStore.load()
    const endfieldClient = new EndfieldClient()
    const authService = new AuthService({
      authClient: new EndfieldAuthClient(),
      profileRepository,
      profilesFile,
      formatProfileLabel: profileRepository.formatLabel.bind(profileRepository),
    })
    let attendanceService: AttendanceService | null = null
    let codeWatchService: CodeWatchService | null = null
    const resolvedCodeSources = config.CODE_WATCH_ENABLED
      ? resolveCodeSources(config.codeWatchSourceIds)
      : { sources: [], unknownSourceIds: [] as string[] }
    const sourceById = new Map(
      resolvedCodeSources.sources.map(source => [source.id, source]),
    )

    if (resolvedCodeSources.unknownSourceIds.length > 0) {
      logger.warn('Unknown code watch sources configured; ignoring', {
        unknown: resolvedCodeSources.unknownSourceIds,
        available: AVAILABLE_CODE_SOURCE_IDS,
      })
    }
    if (config.CODE_WATCH_ENABLED && resolvedCodeSources.sources.length === 0) {
      logger.warn('Code watch enabled but no valid sources configured')
    }

    const commandHandlers = {
      onCheckIn: async () => {
        if (!attendanceService) {
          logger.warn('Manual check-in requested before attendance service is ready')
          return 'Attendance service is still starting. Please try again shortly.'
        }
        const results = await attendanceService.run('manual')
        if (results.length === 0) {
          return 'Attendance run skipped; another run is in progress.'
        }
        return { embeds: buildManualEmbeds(results) }
      },
      getStatus: async () => {
        const embeds = []
        let index = 0
        for (const profile of profiles) {
          index += 1
          const label = profileRepository.formatLabel(profile, index)
          const status = await endfieldClient.fetchStatus(profile)
          embeds.push(buildStatusEmbed(label, status))
        }
        if (embeds.length === 0) {
          return 'No profiles configured.'
        }
        return { embeds }
      },
      getCodes: config.CODE_WATCH_ENABLED
        ? async (sourceId?: string) => {
          if (!codeWatchService) {
            logger.warn('Codes requested before code watch service is ready')
            return 'Code watch is still starting. Please try again shortly.'
          }
          const normalizedSourceId = sourceId?.trim()
          const selectedSource = normalizedSourceId
            ? sourceById.get(normalizedSourceId)
            : undefined
          if (normalizedSourceId && !selectedSource) {
            const available = resolvedCodeSources.sources.map(source => source.id).join(', ')
            return `Unknown source "${normalizedSourceId}". Available sources: ${available || 'none configured'}.`
          }
          const codes = codeWatchService.listLatest(10, true, normalizedSourceId)
          return { embeds: [buildCodesListEmbed(codes, { sourceName: selectedSource?.name })] }
        }
        : undefined,
      runCodesCheck: config.CODE_WATCH_ENABLED
        ? async () => {
          if (!codeWatchService) {
            logger.warn('Codes check requested before code watch service is ready')
            return 'Code watch is still starting. Please try again shortly.'
          }
          const summary = await codeWatchService.run('manual')
          const embeds = [buildCodeWatchRunEmbed(summary)]
          if (summary.notifiedCodes.length > 0) {
            summary.notifiedCodes.slice(0, 5).forEach((code, idx) => {
              embeds.push(buildCodeDiscoveryEmbed(code, 'manual', idx + 1, summary.notifiedCodes.length))
            })
          }
          return { embeds }
        }
        : undefined,
    }

    const discordNotifier = await DiscordNotifier.create({
      botToken: config.DISCORD_BOT_TOKEN,
      appId: config.DISCORD_APP_ID,
      guildId: config.DISCORD_GUILD_ID,
      channelId: config.DISCORD_CHANNEL_ID,
      webhookUrl: config.DISCORD_WEBHOOK_URL,
      codeSources: config.CODE_WATCH_ENABLED
        ? resolvedCodeSources.sources.map(source => ({ id: source.id, name: source.name }))
        : undefined,
      ...commandHandlers,
    })
    const telegramNotifier = await TelegramNotifier.create({
      botToken: config.TELEGRAM_BOT_TOKEN,
      chatId: config.TELEGRAM_CHAT_ID,
      allowedChatIds: config.telegramAllowedChatIds,
      threadId: config.TELEGRAM_THREAD_ID,
      timezone: config.TZ ?? 'Asia/Shanghai',
      pollingEnabled: config.TELEGRAM_POLLING_ENABLED,
      disableNotification: config.TELEGRAM_DISABLE_NOTIFICATION,
      codeSources: config.CODE_WATCH_ENABLED
        ? resolvedCodeSources.sources.map(source => ({ id: source.id, name: source.name }))
        : undefined,
      ...commandHandlers,
    })

    const discordNotificationEnabled = Boolean(
      config.DISCORD_WEBHOOK_URL || (config.DISCORD_BOT_TOKEN && config.DISCORD_CHANNEL_ID),
    )
    const telegramNotificationEnabled = Boolean(
      config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID && config.TELEGRAM_DISABLE_NOTIFICATION !== true,
    )
    const notifier = createNotificationNotifier([
      ...(discordNotificationEnabled ? [discordNotifier] : []),
      ...(telegramNotificationEnabled ? [telegramNotifier] : []),
    ])

    if (config.DISCORD_WEBHOOK_URL) {
      logger.info('Discord notifier configured', { mode: 'webhook' })
    }
    else if (config.DISCORD_BOT_TOKEN && config.DISCORD_CHANNEL_ID) {
      logger.info('Discord notifier configured', { mode: 'bot' })
    }
    else {
      logger.info('Discord notifier not configured')
    }
    if (config.TELEGRAM_BOT_TOKEN) {
      logger.info('Telegram integration configured', {
        polling: config.TELEGRAM_POLLING_ENABLED !== false,
        commandsAllowedChats: config.telegramAllowedChatIds.length,
        notificationsEnabled: telegramNotificationEnabled,
      })
    }
    else {
      logger.info('Telegram integration not configured')
    }

    attendanceService = new AttendanceService({
      client: endfieldClient,
      profiles,
      state,
      stateStore,
      formatProfileLabel: profileRepository.formatLabel.bind(profileRepository),
      refreshTokenForProfile: async (profile) => {
        await authService.refreshIfPossible([profile])
      },
      buildRunEmbed,
      notifier,
    })

    if (config.CODE_WATCH_ENABLED) {
      const codeStore = new CodeStore(config.DATA_PATH)
      const codeState = await codeStore.load()

      codeWatchService = new CodeWatchService({
        enabled: resolvedCodeSources.sources.length > 0,
        mode: config.CODE_WATCH_MODE,
        timeoutMs: config.CODE_WATCH_HTTP_TIMEOUT_MS,
        leaseSeconds: config.CODE_WATCH_LEASE_SECONDS,
        maxRequestsPerHour: config.CODE_WATCH_MAX_REQUESTS_PER_HOUR,
        sources: resolvedCodeSources.sources,
        store: codeStore,
        state: codeState,
        notifier,
        buildDiscoveryPayload: (codes, reason, timestamp) => ({
          embeds: [buildCodeDiscoveryBatchEmbed(codes, reason, timestamp)],
        }),
      })
      logger.info('Code watch service configured', {
        mode: config.CODE_WATCH_MODE,
        sources: resolvedCodeSources.sources.map(source => source.id),
        timeoutMs: config.CODE_WATCH_HTTP_TIMEOUT_MS,
        maxRequestsPerHour: config.CODE_WATCH_MAX_REQUESTS_PER_HOUR,
      })
    }

    const codeWatchEnabled = codeWatchService?.isEnabled() ?? false

    const scheduler = new SchedulerService({
      cronSchedule: config.CRON_SCHEDULE,
      tokenRefreshCron: config.TOKEN_REFRESH_CRON,
      codeWatchEnabled,
      codeWatchMode: config.CODE_WATCH_MODE,
      codeWatchCron: config.CODE_WATCH_CRON,
      codeWatchStartupScan: config.CODE_WATCH_STARTUP_SCAN,
      timezone: config.TZ ?? 'Asia/Shanghai',
      profiles,
      state,
      runNow: async (reason, targetProfiles) => {
        if (!attendanceService) {
          throw new Error('Attendance service not initialized')
        }
        await attendanceService.run(reason, targetProfiles)
      },
      runCodeWatch: async (reason) => {
        if (!codeWatchService) return
        await codeWatchService.run(reason)
      },
      refreshTokens: async () => authService.refreshIfPossible(profiles),
    })

    await scheduler.start()
    logger.info('App started')
  }
}

function buildManualEmbeds(results: RunResult[]) {
  return results.map((result, idx) => buildRunEmbed(result, 'manual', idx + 1, results.length))
}

function createNotificationNotifier(notifiers: Notifier[]): Notifier | undefined {
  if (notifiers.length === 0) return undefined
  if (notifiers.length === 1) return notifiers[0]
  return new CompositeNotifier(notifiers)
}

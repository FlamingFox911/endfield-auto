import { loadConfig } from './config.js'
import { attend, fetchAttendanceStatus } from './endfield.js'
import { logger } from './logger.js'
import { parseProfilesFile, formatProfileLabel } from './profiles.js'
import { startScheduler } from './scheduler.js'
import type { RunReason } from './scheduler.js'
import { loadProfilesFile, loadState, saveState } from './storage.js'
import type { AttendanceReward, AttendanceStatus, EndfieldProfile, RunResult } from './types.js'
import { getShanghaiDate } from './utils.js'
import { registerCommands, sendDiscordMessage, startDiscordBot } from './discord.js'
import type { DiscordMessagePayload } from './discord.js'
import { sendWebhook } from './notify.js'
import { buildRunEmbed, buildStatusEmbed } from './discord-format.js'

async function main() {
  const config = loadConfig()
  const profilesFile = parseProfilesFile(await loadProfilesFile(config.profilePath))
  const profiles = profilesFile.profiles
  const state = await loadState(config.DATA_PATH)

  let inFlight = false
  let discordClient: Awaited<ReturnType<typeof startDiscordBot>> | null = null
  let lastRunSummary = 'No runs yet.'

  const notify = async (message: DiscordMessagePayload) => {
    if (discordClient && config.DISCORD_CHANNEL_ID) {
      await sendDiscordMessage(discordClient, config.DISCORD_CHANNEL_ID, message)
      return
    }
    if (config.DISCORD_WEBHOOK_URL) {
      await sendWebhook(config.DISCORD_WEBHOOK_URL, message)
      return
    }
    if (typeof message === 'string') {
      logger.info(message)
      return
    }
    if (message.content) {
      logger.info(message.content)
    }
  }

  const formatRewardsInline = (rewards: AttendanceReward[] | undefined): string | undefined => {
    if (!rewards || rewards.length === 0) return undefined
    return rewards
      .map((reward) => {
        const count = typeof reward.count === 'number' ? ` x${reward.count}` : ''
        return `${reward.name}${count}`
      })
      .join(', ')
  }

  const logStatus = (label: string, status?: AttendanceStatus) => {
    if (!status) return
    if (!status.ok) {
      logger.warn('Attendance status unavailable', { profile: label, message: status.message })
      return
    }
    logger.info('Attendance status', {
      profile: label,
      today: status.hasToday ?? 'unknown',
      done: status.doneCount ?? 'unknown',
      total: status.totalCount ?? 'unknown',
      missing: status.missingCount ?? 'unknown',
    })
  }

  const runAttendance = async (reason: RunReason, targetProfiles?: EndfieldProfile[]): Promise<RunResult[]> => {
    if (inFlight) {
      logger.warn('Attendance run skipped; another run is in progress')
      return []
    }

    inFlight = true
    const runProfiles = targetProfiles ?? profiles
    const today = getShanghaiDate()
    const results: RunResult[] = []
    const startedAt = new Date()

    try {
      let index = 0
      for (const profile of runProfiles) {
        index += 1
        const label = formatProfileLabel(profile)
        logger.info(`Running attendance for ${label} (${reason})`)

        const result = await attend(profile)
        const ok = result.ok || result.already === true

        if (!state.lastRunByProfile) state.lastRunByProfile = {}
        if (!state.lastSuccessByProfile) state.lastSuccessByProfile = {}

        state.lastRunByProfile[profile.id] = today
        if (ok) {
          state.lastSuccessByProfile[profile.id] = today
        }

        const runResult: RunResult = {
          profileId: profile.id,
          profileLabel: label,
          ok,
          already: result.already,
          message: result.message,
          rewards: result.rewards,
          status: result.status,
        }

        results.push(runResult)

        logStatus(label, result.status)

        if (result.rewards && result.rewards.length > 0) {
          logger.info('Attendance rewards', {
            profile: label,
            rewards: formatRewardsInline(result.rewards),
          })
        }
        else if (!ok) {
          logger.warn('Attendance check-in failed', { profile: label, message: result.message })
        }

        const embed = buildRunEmbed(runResult, reason, index, runProfiles.length, startedAt)
        await notify({ embeds: [embed] })

        const summary = `${label}: ${ok ? 'ok' : 'failed'} - ${result.message}`
        logger.info(summary)
      }

      const summaryLines = results.map((item) => {
        const status = item.ok ? 'ok' : item.already ? 'already' : 'failed'
        const todayStatus = item.status?.hasToday === true ? 'done' : item.status?.hasToday === false ? 'not done' : 'unknown'
        const progress = item.status && typeof item.status.doneCount === 'number' && typeof item.status.totalCount === 'number'
          ? `${item.status.doneCount}/${item.status.totalCount}`
          : 'unknown'
        return `${item.profileLabel ?? item.profileId}: ${status} - ${item.message} (today: ${todayStatus}, progress: ${progress})`
      })
      lastRunSummary = summaryLines.join('\n')

      await saveState(config.DATA_PATH, state)
      return results
    }
    finally {
      inFlight = false
    }
  }


  if (config.DISCORD_BOT_TOKEN && config.DISCORD_CHANNEL_ID) {
    if (config.DISCORD_APP_ID && config.DISCORD_GUILD_ID) {
      await registerCommands(config.DISCORD_BOT_TOKEN, config.DISCORD_APP_ID, config.DISCORD_GUILD_ID)
    }

    discordClient = await startDiscordBot({
      token: config.DISCORD_BOT_TOKEN,
      channelId: config.DISCORD_CHANNEL_ID,
      appId: config.DISCORD_APP_ID,
      guildId: config.DISCORD_GUILD_ID,
      onCheckIn: async () => {
        const results = await runAttendance('manual')
        if (results.length === 0) {
          return 'Attendance run skipped; another run is in progress.'
        }
        const embeds = results.map((result, idx) => buildRunEmbed(result, 'manual', idx + 1, results.length))
        return { embeds }
      },
      getStatus: async () => {
        const embeds = []
        for (const profile of profiles) {
          const label = formatProfileLabel(profile)
          const status = await fetchAttendanceStatus(profile)
          embeds.push(buildStatusEmbed(label, status))
        }
        if (embeds.length === 0) {
          return 'No profiles configured.'
        }
        return { embeds }
      },
    })
  }

  await startScheduler({
    cronSchedule: config.CRON_SCHEDULE,
    timezone: config.TZ ?? 'Asia/Shanghai',
    profiles,
    state,
    runNow: async (reason, targetProfiles) => {
      await runAttendance(reason, targetProfiles)
    },
  })
}

main().catch((error) => {
  logger.error('Fatal error', { error })
  process.exitCode = 1
})




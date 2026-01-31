import { loadConfig } from '../config/index.js'
import { AttendanceService } from '../core/attendance/service.js'
import { SchedulerService } from '../core/scheduler/service.js'
import { ProfileRepository } from '../core/profiles/repository.js'
import { StateStore } from '../core/state/store.js'
import { EndfieldClient } from '../integrations/endfield/client.js'
import { DiscordNotifier } from '../integrations/discord/notifier.js'
import { buildRunEmbed, buildStatusEmbed } from '../integrations/discord/format.js'
import type { RunResult } from '../types/index.js'

export class App {
  async start(): Promise<void> {
    const config = loadConfig()
    const profileRepository = new ProfileRepository(config.profilePath)
    const profilesFile = await profileRepository.load()
    const profiles = profilesFile.profiles
    const stateStore = new StateStore(config.DATA_PATH)
    const state = await stateStore.load()
    const endfieldClient = new EndfieldClient()

    let attendanceService = new AttendanceService({
      client: endfieldClient,
      profiles,
      state,
      stateStore,
      formatProfileLabel: profileRepository.formatLabel.bind(profileRepository),
      buildRunEmbed,
    })

    const notifier = await DiscordNotifier.create({
      botToken: config.DISCORD_BOT_TOKEN,
      appId: config.DISCORD_APP_ID,
      guildId: config.DISCORD_GUILD_ID,
      channelId: config.DISCORD_CHANNEL_ID,
      webhookUrl: config.DISCORD_WEBHOOK_URL,
      onCheckIn: async () => {
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
    })

    attendanceService = new AttendanceService({
      client: endfieldClient,
      profiles,
      state,
      stateStore,
      formatProfileLabel: profileRepository.formatLabel.bind(profileRepository),
      buildRunEmbed,
      notifier,
    })

    const scheduler = new SchedulerService({
      cronSchedule: config.CRON_SCHEDULE,
      timezone: config.TZ ?? 'Asia/Shanghai',
      profiles,
      state,
      runNow: async (reason, targetProfiles) => {
        await attendanceService.run(reason, targetProfiles)
      },
    })

    await scheduler.start()
  }
}

function buildManualEmbeds(results: RunResult[]) {
  return results.map((result, idx) => buildRunEmbed(result, 'manual', idx + 1, results.length))
}

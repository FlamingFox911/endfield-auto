import { loadConfig } from './config.js'
import { attend } from './endfield.js'
import { logger } from './logger.js'
import { parseProfilesFile, formatProfileLabel } from './profiles.js'
import { startScheduler } from './scheduler.js'
import type { RunReason } from './scheduler.js'
import { loadProfilesFile, loadState, saveState } from './storage.js'
import type { EndfieldProfile, RunResult } from './types.js'
import { getShanghaiDate } from './utils.js'
import { registerCommands, sendDiscordMessage, startDiscordBot } from './discord.js'
import { sendWebhook } from './notify.js'

async function main() {
  const config = loadConfig()
  const profilesFile = parseProfilesFile(await loadProfilesFile(config.profilePath))
  const profiles = profilesFile.profiles
  const state = await loadState(config.DATA_PATH)

  let inFlight = false
  let discordClient: Awaited<ReturnType<typeof startDiscordBot>> | null = null
  let lastRunSummary = 'No runs yet.'

  const notify = async (message: string) => {
    if (discordClient && config.DISCORD_CHANNEL_ID) {
      await sendDiscordMessage(discordClient, config.DISCORD_CHANNEL_ID, message)
      return
    }
    if (config.DISCORD_WEBHOOK_URL) {
      await sendWebhook(config.DISCORD_WEBHOOK_URL, message)
      return
    }
    logger.info(message)
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

    try {
      for (const profile of runProfiles) {
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

        results.push({
          profileId: profile.id,
          ok,
          already: result.already,
          message: result.message,
        })

        const summary = `${label}: ${ok ? 'ok' : 'failed'} - ${result.message}`
        await notify(summary)
      }

      const summaryLines = results.map((item) => {
        const status = item.ok ? 'ok' : 'failed'
        return `${item.profileId}: ${status} - ${item.message}`
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
      onCheckIn: async () => runAttendance('manual'),
      getStatus: () => lastRunSummary,
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




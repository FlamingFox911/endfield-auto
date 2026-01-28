import cron from 'node-cron'
import type { EndfieldProfile } from './types.js'
import { getShanghaiDate } from './utils.js'
import { logger } from './logger.js'
import type { AppState } from './storage.js'

export type RunReason = 'startup' | 'scheduled' | 'manual'

export interface SchedulerOptions {
  cronSchedule: string
  timezone: string
  profiles: EndfieldProfile[]
  state: AppState
  runNow: (reason: RunReason, profiles?: EndfieldProfile[]) => Promise<void>
}

export async function startScheduler(options: SchedulerOptions): Promise<void> {
  const { cronSchedule, timezone, profiles, state, runNow } = options

  const today = getShanghaiDate()
  const dueProfiles = profiles.filter(profile => {
    const lastSuccess = state.lastSuccessByProfile?.[profile.id]
    return lastSuccess !== today
  })

  if (dueProfiles.length > 0) {
    logger.info('Startup catch-up triggered', { profiles: dueProfiles.map(p => p.id) })
    await runNow('startup', dueProfiles)
  }

  cron.schedule(cronSchedule, async () => {
    logger.info('Scheduled run triggered')
    await runNow('scheduled')
  }, { timezone })
}

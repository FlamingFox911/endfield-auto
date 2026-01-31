import cron from 'node-cron'
import type { EndfieldProfile } from '../../types/index.js'
import { getShanghaiDate } from '../../utils/time.js'
import { logger } from '../../utils/logger.js'
import type { AppState } from '../state/store.js'
import type { RunReason } from '../attendance/types.js'

export interface SchedulerOptions {
  cronSchedule: string
  timezone: string
  profiles: EndfieldProfile[]
  state: AppState
  runNow: (reason: RunReason, profiles?: EndfieldProfile[]) => Promise<void>
}

export class SchedulerService {
  private readonly cronSchedule: string
  private readonly timezone: string
  private readonly profiles: EndfieldProfile[]
  private readonly state: AppState
  private readonly runNow: (reason: RunReason, profiles?: EndfieldProfile[]) => Promise<void>

  constructor(options: SchedulerOptions) {
    this.cronSchedule = options.cronSchedule
    this.timezone = options.timezone
    this.profiles = options.profiles
    this.state = options.state
    this.runNow = options.runNow
  }

  async start(): Promise<void> {
    const today = getShanghaiDate()
    const dueProfiles = this.profiles.filter(profile => {
      const lastSuccess = this.state.lastSuccessByProfile?.[profile.id]
      return lastSuccess !== today
    })

    if (dueProfiles.length > 0) {
      logger.info('Startup catch-up triggered', { profiles: dueProfiles.map(p => p.id) })
      await this.runNow('startup', dueProfiles)
    }

    cron.schedule(this.cronSchedule, async () => {
      logger.info('Scheduled run triggered')
      await this.runNow('scheduled')
    }, { timezone: this.timezone })
  }
}

import cron from 'node-cron'
import type { EndfieldProfile } from '../../types/index.js'
import { getShanghaiDate } from '../../utils/time.js'
import { logger } from '../../utils/logger.js'
import type { AppState } from '../state/store.js'
import type { RunReason } from '../attendance/types.js'

export interface SchedulerOptions {
  cronSchedule: string
  tokenRefreshCron?: string
  timezone: string
  profiles: EndfieldProfile[]
  state: AppState
  runNow: (reason: RunReason, profiles?: EndfieldProfile[]) => Promise<void>
  refreshTokens?: () => Promise<void>
}

export class SchedulerService {
  private readonly cronSchedule: string
  private readonly tokenRefreshCron?: string
  private readonly timezone: string
  private readonly profiles: EndfieldProfile[]
  private readonly state: AppState
  private readonly runNow: (reason: RunReason, profiles?: EndfieldProfile[]) => Promise<void>
  private readonly refreshTokens?: () => Promise<void>

  constructor(options: SchedulerOptions) {
    this.cronSchedule = options.cronSchedule
    this.tokenRefreshCron = options.tokenRefreshCron
    this.timezone = options.timezone
    this.profiles = options.profiles
    this.state = options.state
    this.runNow = options.runNow
    this.refreshTokens = options.refreshTokens
  }

  async start(): Promise<void> {
    logger.info('Scheduler starting', {
      cronSchedule: this.cronSchedule,
      timezone: this.timezone,
    })

    if (this.refreshTokens) {
      try {
        logger.info('Startup token refresh triggered')
        await this.refreshTokens()
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('Startup token refresh failed', { error: message })
      }
    }

    const today = getShanghaiDate()
    const dueProfiles = this.profiles.filter(profile => {
      const lastSuccess = this.state.lastSuccessByProfile?.[profile.id]
      return lastSuccess !== today
    })

    if (dueProfiles.length > 0) {
      logger.info('Startup catch-up triggered', { profiles: dueProfiles.map(p => p.id) })
      await this.runNow('startup', dueProfiles)
    }
    else {
      logger.debug('Startup catch-up not needed')
    }

    cron.schedule(this.cronSchedule, async () => {
      logger.info('Scheduled run triggered')
      await this.runNow('scheduled')
    }, { timezone: this.timezone })

    if (this.tokenRefreshCron && this.refreshTokens) {
      cron.schedule(this.tokenRefreshCron, async () => {
        logger.info('Scheduled token refresh triggered')
        await this.refreshTokens?.()
      }, { timezone: this.timezone })
    }
    logger.info('Scheduler started')
  }
}

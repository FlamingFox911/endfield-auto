import type { AttendanceReward, AttendanceStatus, EndfieldProfile, RunResult } from '../../types/index.js'
import type { AttendanceClient, RunReason } from './types.js'
import type { Notifier } from '../notifications/types.js'
import type { AppState } from '../state/store.js'
import { StateStore } from '../state/store.js'
import { getShanghaiDate } from '../../utils/time.js'
import { logger } from '../../utils/logger.js'

export interface AttendanceServiceOptions {
  client: AttendanceClient
  profiles: EndfieldProfile[]
  state: AppState
  stateStore: StateStore
  formatProfileLabel: (profile: EndfieldProfile, index?: number) => string
  buildRunEmbed?: (result: RunResult, reason: RunReason, index: number, total: number, timestamp: Date) => unknown
  notifier?: Notifier
}

function formatRewardsInline(rewards: AttendanceReward[] | undefined): string | undefined {
  if (!rewards || rewards.length === 0) return undefined
  return rewards
    .map((reward) => {
      const count = typeof reward.count === 'number' ? ` x${reward.count}` : ''
      return `${reward.name}${count}`
    })
    .join(', ')
}

function logStatus(label: string, status?: AttendanceStatus) {
  if (!status) return
  if (!status.ok) {
    logger.warn('Attendance status unavailable', { profile: label, message: status.message })
    return
  }
  logger.debug('Attendance status', {
    profile: label,
    today: status.hasToday ?? 'unknown',
    done: status.doneCount ?? 'unknown',
    total: status.totalCount ?? 'unknown',
    missing: status.missingCount ?? 'unknown',
  })
}

export class AttendanceService {
  private readonly client: AttendanceClient
  private readonly profiles: EndfieldProfile[]
  private readonly state: AppState
  private readonly stateStore: StateStore
  private readonly formatProfileLabel: (profile: EndfieldProfile, index?: number) => string
  private readonly buildRunEmbed?: (result: RunResult, reason: RunReason, index: number, total: number, timestamp: Date) => unknown
  private readonly notifier?: Notifier
  private inFlight = false

  constructor(options: AttendanceServiceOptions) {
    this.client = options.client
    this.profiles = options.profiles
    this.state = options.state
    this.stateStore = options.stateStore
    this.formatProfileLabel = options.formatProfileLabel
    this.buildRunEmbed = options.buildRunEmbed
    this.notifier = options.notifier
  }

  async run(reason: RunReason, targetProfiles?: EndfieldProfile[]): Promise<RunResult[]> {
    if (this.inFlight) {
      logger.warn('Attendance run skipped; another run is in progress')
      return []
    }

    this.inFlight = true
    const runProfiles = targetProfiles ?? this.profiles
    const today = getShanghaiDate()
    const results: RunResult[] = []
    const startedAt = new Date()
    logger.info('Attendance run started', {
      reason,
      profiles: runProfiles.length,
    })

    try {
      let index = 0
      for (const profile of runProfiles) {
        index += 1
        const label = this.formatProfileLabel(profile, index)
        logger.info(`Running attendance for ${label} (${reason})`)

        const result = await this.client.attend(profile)
        const ok = result.ok || result.already === true

        if (!this.state.lastRunByProfile) this.state.lastRunByProfile = {}
        if (!this.state.lastSuccessByProfile) this.state.lastSuccessByProfile = {}

        this.state.lastRunByProfile[profile.id] = today
        if (ok) {
          this.state.lastSuccessByProfile[profile.id] = today
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
          logger.debug('Attendance rewards', {
            profile: label,
            rewards: formatRewardsInline(result.rewards),
          })
        }
        else if (!ok) {
          logger.warn('Attendance check-in failed', { profile: label, message: result.message })
        }

        if (reason !== 'manual' && this.notifier && this.buildRunEmbed) {
          const embed = this.buildRunEmbed(runResult, reason, index, runProfiles.length, startedAt)
          await this.notifier.send({ embeds: [embed] })
        }

        const summary = `${label}: ${ok ? 'ok' : 'failed'} - ${result.message}`
        logger.info(summary)
      }

      await this.stateStore.save(this.state)
      const okCount = results.filter(result => result.ok).length
      const failedCount = results.length - okCount
      const durationMs = Date.now() - startedAt.getTime()
      logger.info('Attendance run completed', {
        reason,
        profiles: runProfiles.length,
        ok: okCount,
        failed: failedCount,
        durationMs,
      })
      return results
    }
    finally {
      this.inFlight = false
    }
  }
}

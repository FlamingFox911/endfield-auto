import os from 'node:os'
import type { NotificationPayload, Notifier } from '../notifications/types.js'
import { logger } from '../../utils/logger.js'
import { CodeStore } from './store.js'
import type {
  CodeCandidate,
  CodeSourceAdapter,
  CodeSourceState,
  CodeWatchMode,
  CodeWatchRunReason,
  CodeWatchRunSummary,
  CodeWatchState,
  TrackedCode,
  TrackedCodeSource,
} from './types.js'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_LIST_LIMIT = 10
const MAX_BACKOFF_MS = 60 * 60 * 1000
const INVALID_CODE_TOKENS = new Set([
  'RELATED',
  'IN-GAME',
  'INGAME',
  'FEATURE',
  'REWARD',
  'CHARACTERS',
  'RECOMMENDED',
  'COPIED',
  'EXPIRED',
  'ACTIVE',
  'CODES',
  'CODE',
])

export interface CodeWatchServiceOptions {
  enabled: boolean
  mode: CodeWatchMode
  timeoutMs: number
  leaseSeconds: number
  maxRequestsPerHour: number
  sources: CodeSourceAdapter[]
  store: CodeStore
  state: CodeWatchState
  notifier?: Notifier
  buildDiscoveryPayload?: (codes: TrackedCode[], reason: CodeWatchRunReason, timestamp: Date) => NotificationPayload
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

function isTrackableCode(raw: string): boolean {
  const token = normalizeCode(raw)
  if (!token) return false
  return !INVALID_CODE_TOKENS.has(token)
}

function safeDateMs(value: string | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function mergeSource(existing: TrackedCodeSource | undefined, candidate: CodeCandidate, nowIso: string): TrackedCodeSource {
  if (!existing) {
    return {
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      sourceTier: candidate.sourceTier,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      publishedAt: candidate.publishedAt,
      referenceUrl: candidate.referenceUrl,
    }
  }

  return {
    ...existing,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    sourceTier: candidate.sourceTier,
    lastSeenAt: nowIso,
    publishedAt: candidate.publishedAt ?? existing.publishedAt,
    referenceUrl: candidate.referenceUrl ?? existing.referenceUrl,
  }
}

function getBackoffMs(failureCount: number): number {
  const exponent = Math.min(Math.max(failureCount - 1, 0), 6)
  return Math.min(MAX_BACKOFF_MS, (2 ** exponent) * 5 * 60 * 1000)
}

function isNotifiable(code: TrackedCode): boolean {
  const hasOfficial = code.sources.some(source => source.sourceTier === 'official')
  if (hasOfficial) return true
  const hasCurated = code.sources.some(source => source.sourceTier === 'curated')
  if (hasCurated) return true
  return code.sources.length >= 2
}

function byMostRecentDesc(left: TrackedCode, right: TrackedCode): number {
  const leftTime = new Date(left.lastSeenAt).getTime()
  const rightTime = new Date(right.lastSeenAt).getTime()
  if (rightTime !== leftTime) return rightTime - leftTime
  return left.code.localeCompare(right.code)
}

export class CodeWatchService {
  private readonly enabled: boolean
  private readonly mode: CodeWatchMode
  private readonly timeoutMs: number
  private readonly leaseMs: number
  private readonly maxRequestsPerHour: number
  private readonly sources: CodeSourceAdapter[]
  private readonly store: CodeStore
  private readonly notifier?: Notifier
  private readonly buildDiscoveryPayload?: (codes: TrackedCode[], reason: CodeWatchRunReason, timestamp: Date) => NotificationPayload
  private readonly leaseHolder: string
  private state: CodeWatchState
  private pendingSave = false
  private inFlight = false

  constructor(options: CodeWatchServiceOptions) {
    this.enabled = options.enabled
    this.mode = options.mode
    this.timeoutMs = options.timeoutMs
    this.leaseMs = Math.max(30_000, options.leaseSeconds * 1000)
    this.maxRequestsPerHour = Math.max(1, options.maxRequestsPerHour)
    this.sources = options.sources
    this.store = options.store
    this.state = options.state
    this.notifier = options.notifier
    this.buildDiscoveryPayload = options.buildDiscoveryPayload
    this.leaseHolder = `${os.hostname()}-${process.pid}`
    this.pendingSave = this.pruneInvalidCodes()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  listLatest(limit = DEFAULT_LIST_LIMIT, notifiedOnly = false, sourceId?: string): TrackedCode[] {
    const normalizedSourceId = sourceId?.trim()
    const allCodes = Object.values(this.state.codes)
      .filter(code => isTrackableCode(code.code))
      .filter(code => !notifiedOnly || Boolean(code.firstNotifiedAt))
      .filter(code => !normalizedSourceId || code.sources.some(source => source.sourceId === normalizedSourceId))
      .sort(byMostRecentDesc)
    return allCodes.slice(0, Math.max(1, limit))
  }

  async run(reason: CodeWatchRunReason): Promise<CodeWatchRunSummary> {
    const startedAt = new Date()
    const baseSummary: CodeWatchRunSummary = {
      mode: this.mode,
      reason,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      checkedSources: [],
      skippedSources: [],
      newCodes: [],
      notifiedCodes: [],
      totalKnown: Object.keys(this.state.codes).length,
    }

    if (!this.enabled) {
      return {
        ...baseSummary,
        skippedSources: [{ sourceId: 'all', reason: 'disabled' }],
        finishedAt: new Date().toISOString(),
      }
    }

    if (this.mode !== 'active') {
      return {
        ...baseSummary,
        skippedSources: [{ sourceId: 'all', reason: 'passive mode' }],
        finishedAt: new Date().toISOString(),
      }
    }

    if (this.inFlight) {
      return {
        ...baseSummary,
        skippedSources: [{ sourceId: 'all', reason: 'run in progress' }],
        finishedAt: new Date().toISOString(),
      }
    }

    this.inFlight = true
    let changed = false
    const touchedByCode = new Map<string, TrackedCode>()
    const newByCode = new Map<string, TrackedCode>()

    try {
      const lockAcquired = await this.store.acquireLease(this.leaseHolder, this.leaseMs)
      if (!lockAcquired) {
        return {
          ...baseSummary,
          skippedSources: [{ sourceId: 'all', reason: 'lease held by another active instance' }],
          finishedAt: new Date().toISOString(),
        }
      }

      for (const source of this.sources) {
        const now = new Date()
        const nowIso = now.toISOString()
        const state = this.ensureSourceState(source.id)

        const skipReason = this.getSkipReason(source, state, now.getTime())
        if (skipReason) {
          baseSummary.skippedSources.push({ sourceId: source.id, reason: skipReason })
          continue
        }

        this.incrementSourceRequestWindow(state, nowIso, now.getTime())
        state.lastCheckedAt = nowIso
        changed = true
        baseSummary.checkedSources.push(source.id)

        try {
          const result = await source.fetch({ state, timeoutMs: this.timeoutMs })
          state.lastStatus = result.httpStatus
          state.lastError = undefined
          state.failureCount = 0
          state.backoffUntil = undefined
          state.lastSuccessAt = nowIso
          if (result.etag) state.lastEtag = result.etag
          if (result.lastModified) state.lastModified = result.lastModified
          if (result.contentHash) state.lastContentHash = result.contentHash

          if (!result.notModified && result.candidates.length > 0) {
            const merged = this.mergeCandidates(result.candidates, nowIso)
            for (const code of merged.touched) {
              touchedByCode.set(code.code, code)
            }
            for (const code of merged.newlyDiscovered) {
              newByCode.set(code.code, code)
            }
          }
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const failureCount = (state.failureCount ?? 0) + 1
          const backoffMs = getBackoffMs(failureCount)
          state.failureCount = failureCount
          state.lastError = message
          state.backoffUntil = new Date(Date.now() + backoffMs).toISOString()
          changed = true
          logger.warn('Code source fetch failed', {
            sourceId: source.id,
            error: message,
            failureCount,
            backoffMs,
          })
          baseSummary.skippedSources.push({ sourceId: source.id, reason: `error: ${message}` })
        }
      }

      const nowIso = new Date().toISOString()
      for (const code of touchedByCode.values()) {
        if (code.firstNotifiedAt) continue
        if (!isNotifiable(code)) continue
        code.firstNotifiedAt = nowIso
        code.lastNotifiedAt = nowIso
        baseSummary.notifiedCodes.push(code)
        changed = true
      }

      baseSummary.newCodes = Array.from(newByCode.values()).sort(byMostRecentDesc)
      if (changed || this.pendingSave) {
        await this.store.save(this.state)
        this.pendingSave = false
      }

      baseSummary.totalKnown = Object.keys(this.state.codes).length
      baseSummary.finishedAt = new Date().toISOString()

      await this.sendNotifications(baseSummary, reason, startedAt)

      logger.info('Code watch run completed', {
        reason,
        checkedSources: baseSummary.checkedSources.length,
        skippedSources: baseSummary.skippedSources.length,
        newCodes: baseSummary.newCodes.length,
        notifiedCodes: baseSummary.notifiedCodes.length,
        totalKnown: baseSummary.totalKnown,
      })

      return baseSummary
    }
    finally {
      await this.store.releaseLease(this.leaseHolder)
      this.inFlight = false
    }
  }

  private ensureSourceState(sourceId: string): CodeSourceState {
    if (!this.state.sourceState[sourceId]) {
      this.state.sourceState[sourceId] = {}
    }
    return this.state.sourceState[sourceId] as CodeSourceState
  }

  private getSkipReason(source: CodeSourceAdapter, state: CodeSourceState, nowMs: number): string | null {
    const backoffUntilMs = safeDateMs(state.backoffUntil)
    if (backoffUntilMs && backoffUntilMs > nowMs) {
      return 'backoff active'
    }

    const lastCheckedMs = safeDateMs(state.lastCheckedAt)
    if (lastCheckedMs && nowMs - lastCheckedMs < source.minIntervalMs) {
      return 'min interval not reached'
    }

    const budget = Math.min(source.maxRequestsPerHour, this.maxRequestsPerHour)
    const windowStartMs = safeDateMs(state.windowStartedAt)
    if (!windowStartMs || nowMs - windowStartMs >= HOUR_MS) {
      return null
    }

    const count = state.windowRequestCount ?? 0
    if (count >= budget) {
      return 'hourly request budget reached'
    }

    return null
  }

  private incrementSourceRequestWindow(state: CodeSourceState, nowIso: string, nowMs: number): void {
    const windowStartMs = safeDateMs(state.windowStartedAt)
    if (!windowStartMs || nowMs - windowStartMs >= HOUR_MS) {
      state.windowStartedAt = nowIso
      state.windowRequestCount = 1
      return
    }

    const count = state.windowRequestCount ?? 0
    state.windowRequestCount = count + 1
  }

  private mergeCandidates(candidates: CodeCandidate[], nowIso: string): {
    touched: TrackedCode[]
    newlyDiscovered: TrackedCode[]
  } {
    const touchedByCode = new Map<string, TrackedCode>()
    const newByCode = new Map<string, TrackedCode>()

    for (const candidate of candidates) {
      const normalizedCode = normalizeCode(candidate.code)
      if (!normalizedCode) continue
      if (!isTrackableCode(normalizedCode)) continue

      let tracked = this.state.codes[normalizedCode]
      const isNew = !tracked

      if (!tracked) {
        tracked = {
          code: normalizedCode,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
          sources: [],
        }
        this.state.codes[normalizedCode] = tracked
      }

      const sourceIndex = tracked.sources.findIndex(source => source.sourceId === candidate.sourceId)
      const existingSource = sourceIndex >= 0 ? tracked.sources[sourceIndex] : undefined
      const nextSource = mergeSource(existingSource, candidate, nowIso)
      if (sourceIndex >= 0) {
        tracked.sources[sourceIndex] = nextSource
      }
      else {
        tracked.sources.push(nextSource)
      }

      tracked.lastSeenAt = nowIso
      touchedByCode.set(tracked.code, tracked)
      if (isNew) {
        newByCode.set(tracked.code, tracked)
      }
    }

    return {
      touched: Array.from(touchedByCode.values()),
      newlyDiscovered: Array.from(newByCode.values()),
    }
  }

  private pruneInvalidCodes(): boolean {
    let removed = 0
    for (const [code, tracked] of Object.entries(this.state.codes)) {
      if (isTrackableCode(tracked.code) && isTrackableCode(code)) continue
      delete this.state.codes[code]
      removed += 1
    }
    if (removed > 0) {
      logger.warn('Removed invalid tracked codes from state', { removed })
    }
    return removed > 0
  }

  private async sendNotifications(summary: CodeWatchRunSummary, reason: CodeWatchRunReason, timestamp: Date): Promise<void> {
    if (reason === 'manual') return
    if (!this.notifier || !this.buildDiscoveryPayload) return
    if (summary.notifiedCodes.length === 0) return

    try {
      const payload = this.buildDiscoveryPayload(summary.notifiedCodes, reason, timestamp)
      await this.notifier.send(payload)
    }
    catch (error) {
      logger.warn('Code notification failed', {
        codes: summary.notifiedCodes.map(code => code.code),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

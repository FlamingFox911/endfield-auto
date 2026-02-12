export type CodeWatchMode = 'active' | 'passive'

export type CodeWatchRunReason = 'startup' | 'scheduled' | 'manual'

export type CodeSourceTier = 'official' | 'curated' | 'community'

export interface CodeCandidate {
  code: string
  sourceId: string
  sourceName: string
  sourceUrl: string
  sourceTier: CodeSourceTier
  publishedAt?: string
  referenceUrl?: string
  context?: string
}

export interface TrackedCodeSource {
  sourceId: string
  sourceName: string
  sourceUrl: string
  sourceTier: CodeSourceTier
  firstSeenAt: string
  lastSeenAt: string
  publishedAt?: string
  referenceUrl?: string
}

export interface TrackedCode {
  code: string
  firstSeenAt: string
  lastSeenAt: string
  sources: TrackedCodeSource[]
  firstNotifiedAt?: string
  lastNotifiedAt?: string
}

export interface CodeSourceState {
  lastCheckedAt?: string
  lastSuccessAt?: string
  lastEtag?: string
  lastModified?: string
  lastContentHash?: string
  lastStatus?: number
  lastError?: string
  failureCount?: number
  backoffUntil?: string
  windowStartedAt?: string
  windowRequestCount?: number
}

export interface CodeWatchState {
  version: number
  sourceState: Record<string, CodeSourceState>
  codes: Record<string, TrackedCode>
}

export interface SourceFetchContext {
  state: CodeSourceState
  timeoutMs: number
}

export interface SourceFetchResult {
  fetchedUrl?: string
  httpStatus?: number
  notModified?: boolean
  etag?: string
  lastModified?: string
  contentHash?: string
  candidates: CodeCandidate[]
}

export interface CodeSourceAdapter {
  id: string
  name: string
  url: string
  tier: CodeSourceTier
  minIntervalMs: number
  maxRequestsPerHour: number
  fetch: (context: SourceFetchContext) => Promise<SourceFetchResult>
}

export interface CodeWatchRunSummary {
  mode: CodeWatchMode
  reason: CodeWatchRunReason
  startedAt: string
  finishedAt: string
  checkedSources: string[]
  skippedSources: Array<{ sourceId: string; reason: string }>
  newCodes: TrackedCode[]
  notifiedCodes: TrackedCode[]
  totalKnown: number
}

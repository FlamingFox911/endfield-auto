import { createHash } from 'node:crypto'
import type {
  CodeSourceAdapter,
  SourceFetchContext,
  SourceFetchResult,
} from '../../../../core/codes/types.js'
import { logger } from '../../../../utils/logger.js'
import type { SourceExtractor, SourceMetadata } from './helpers.js'

const DEFAULT_USER_AGENT = 'endfield-auto code-watch/0.1'
const TEXT_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7'

interface TextFetchResult {
  fetchedUrl: string
  httpStatus: number
  notModified: boolean
  etag?: string
  lastModified?: string
  contentHash?: string
  text?: string
}

export interface SourceDefinition extends SourceMetadata {
  minIntervalMs: number
  maxRequestsPerHour: number
  extractor: SourceExtractor
}

async function fetchText(url: string, context: SourceFetchContext): Promise<TextFetchResult> {
  const headers: Record<string, string> = {
    accept: TEXT_ACCEPT,
    'user-agent': DEFAULT_USER_AGENT,
  }
  if (context.state.lastEtag) {
    headers['if-none-match'] = context.state.lastEtag
  }
  if (context.state.lastModified) {
    headers['if-modified-since'] = context.state.lastModified
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), context.timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timeout)
  }

  const etag = response.headers.get('etag') ?? undefined
  const lastModified = response.headers.get('last-modified') ?? undefined

  if (response.status === 304) {
    return {
      fetchedUrl: response.url || url,
      httpStatus: response.status,
      notModified: true,
      etag: etag ?? context.state.lastEtag,
      lastModified: lastModified ?? context.state.lastModified,
      contentHash: context.state.lastContentHash,
    }
  }

  const text = await response.text()
  const contentHash = createHash('sha256').update(text).digest('hex')

  if (!response.ok) {
    const preview = text.length > 180 ? `${text.slice(0, 180)}...` : text
    throw new Error(`HTTP ${response.status}: ${preview}`)
  }

  const unchangedByHash = Boolean(context.state.lastContentHash && context.state.lastContentHash === contentHash)

  return {
    fetchedUrl: response.url || url,
    httpStatus: response.status,
    notModified: unchangedByHash,
    etag,
    lastModified,
    contentHash,
    text: unchangedByHash ? undefined : text,
  }
}

async function runSourceFetch(source: SourceDefinition, context: SourceFetchContext): Promise<SourceFetchResult> {
  logger.debug('Code source fetch request', {
    sourceId: source.id,
    url: source.url,
    timeoutMs: context.timeoutMs,
  })

  const fetched = await fetchText(source.url, context)
  const candidates = fetched.notModified || !fetched.text
    ? []
    : source.extractor(fetched.text, source)

  logger.debug('Code source fetch response', {
    sourceId: source.id,
    status: fetched.httpStatus,
    notModified: fetched.notModified,
    candidates: candidates.length,
  })

  return {
    fetchedUrl: fetched.fetchedUrl,
    httpStatus: fetched.httpStatus,
    notModified: fetched.notModified,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    contentHash: fetched.contentHash,
    candidates,
  }
}

export function createCodeSourceAdapter(source: SourceDefinition): CodeSourceAdapter {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    tier: source.tier,
    minIntervalMs: source.minIntervalMs,
    maxRequestsPerHour: source.maxRequestsPerHour,
    fetch: (context) => runSourceFetch(source, context),
  }
}

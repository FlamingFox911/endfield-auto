import type { CodeCandidate } from '../../../../core/codes/types.js'
import { createCodeSourceAdapter } from '../shared/adapter.js'
import {
  buildCodeCandidatesFromSet,
  looksLikeCode,
  normalizeCode,
  parseIsoDateOrUndefined,
  stripHtmlWithLineBreaks,
  type SourceMetadata,
} from '../shared/helpers.js'

function parseDestructoidCandidates(text: string, source: SourceMetadata): CodeCandidate[] {
  const publishedAt = parseIsoDateOrUndefined(
    /updated:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i.exec(text)?.[1],
  )

  const lines = stripHtmlWithLineBreaks(text)
  const startPattern = /active\s+arknights\s*:?\s*endfield\s+codes/i
  const endPattern = /expired\s+arknights\s*:?\s*endfield\s+codes/i
  const start = lines.search(startPattern)
  const end = lines.search(endPattern)
  const scoped = start >= 0
    ? lines.slice(start, end > start ? end : undefined)
    : lines

  const codes = new Set<string>()
  const upper = scoped.toUpperCase()

  const bulletPattern = /\b([A-Z0-9_-]{6,24})\s*[\u2013\u2014-]\s*REDEEM\b/g
  let match: RegExpExecArray | null = null
  while (true) {
    match = bulletPattern.exec(upper)
    if (!match) break
    const token = normalizeCode(match[1] ?? '')
    if (!looksLikeCode(token, true)) continue
    codes.add(token)
  }

  return buildCodeCandidatesFromSet(codes, source, publishedAt)
}

export const destructoidSource = createCodeSourceAdapter({
  id: 'destructoid',
  name: 'Destructoid Endfield Codes',
  url: 'https://www.destructoid.com/arknights-endfield-codes/',
  tier: 'curated',
  extractor: parseDestructoidCandidates,
  minIntervalMs: 45 * 60 * 1000,
  maxRequestsPerHour: 4,
})

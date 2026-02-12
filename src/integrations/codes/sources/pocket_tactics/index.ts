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

function parsePocketTacticsCandidates(text: string, source: SourceMetadata): CodeCandidate[] {
  const publishedAt = parseIsoDateOrUndefined(
    /updated:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i.exec(text)?.[1],
  )

  const lines = stripHtmlWithLineBreaks(text)
  const startPattern = /here are the new arknights\s*:?\s*endfield codes/i
  const endPattern = /if you(?:'|\u2019)re wondering which/i
  const start = lines.search(startPattern)
  const end = lines.search(endPattern)
  const scoped = start >= 0
    ? lines.slice(start, end > start ? end : undefined)
    : lines

  const codes = new Set<string>()

  const htmlListPattern = /<li>\s*<strong>\s*([A-Z0-9_-]{6,24})\s*<\/strong>\s*-/gi
  let match: RegExpExecArray | null = null
  while (true) {
    match = htmlListPattern.exec(text)
    if (!match) break
    const token = normalizeCode(match[1] ?? '')
    if (!looksLikeCode(token, true)) continue
    codes.add(token)
  }

  const upperScoped = scoped.toUpperCase()
  const textListPattern = /\b([A-Z0-9_-]{6,24})\b\s*-\s*\d|\b([A-Z0-9_-]{6,24})\b\s*-\s*T-CREDS\b/g
  while (true) {
    match = textListPattern.exec(upperScoped)
    if (!match) break
    const token = normalizeCode(match[1] ?? match[2] ?? '')
    if (!looksLikeCode(token, true)) continue
    codes.add(token)
  }

  return buildCodeCandidatesFromSet(codes, source, publishedAt)
}

export const pocketTacticsSource = createCodeSourceAdapter({
  id: 'pocket_tactics',
  name: 'Pocket Tactics Endfield Codes',
  url: 'https://www.pockettactics.com/arknights-endfield/codes',
  tier: 'curated',
  extractor: parsePocketTacticsCandidates,
  minIntervalMs: 45 * 60 * 1000,
  maxRequestsPerHour: 4,
})

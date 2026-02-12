import type { CodeCandidate } from '../../../../core/codes/types.js'
import { createCodeSourceAdapter } from '../shared/adapter.js'
import {
  buildCodeCandidatesFromSet,
  looksLikeCode,
  normalizeCode,
  parseIsoDateOrUndefined,
  stripHtml,
  type SourceMetadata,
} from '../shared/helpers.js'

function extractCodesFromGame8Cell(cellHtml: string): Set<string> {
  const codes = new Set<string>()

  const valuePatterns = [
    /\bdata-clipboard-text\s*=\s*"([^"]+)"/gi,
    /\bvalue\s*=\s*"([^"]+)"/gi,
  ]
  for (const pattern of valuePatterns) {
    let match: RegExpExecArray | null = null
    while (true) {
      match = pattern.exec(cellHtml)
      if (!match) break
      const token = normalizeCode(match[1] ?? '')
      if (!looksLikeCode(token, true)) continue
      codes.add(token)
    }
  }

  const firstSegment = cellHtml.split(/<br\s*\/?>/i)[0] ?? cellHtml
  const leadingText = stripHtml(firstSegment)
  const leading = /^\s*([A-Z0-9_-]{6,24})\b/.exec(leadingText.toUpperCase())?.[1]
  if (leading) {
    const token = normalizeCode(leading)
    if (looksLikeCode(token, true)) {
      codes.add(token)
    }
  }

  return codes
}

function parseGame8Candidates(text: string, source: SourceMetadata): CodeCandidate[] {
  const publishedAt = parseIsoDateOrUndefined(
    /last updated[:\s]*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i.exec(text)?.[1],
  )
  const codes = new Set<string>()
  const tables = text.match(/<table\b[\s\S]*?<\/table>/gi) ?? []
  const codeTables = tables.filter(table => /\bredeem\s*codes\b/i.test(stripHtml(table)))

  for (const table of codeTables) {
    const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []
    for (const row of rows) {
      if (/<th\b/i.test(row)) continue
      const cells = row.match(/<td\b[\s\S]*?<\/td>/gi) ?? []
      if (cells.length === 0) continue
      const cellCodes = extractCodesFromGame8Cell(cells[0] ?? '')
      for (const code of cellCodes.values()) {
        codes.add(code)
      }
    }
  }

  const plain = stripHtml(text).toUpperCase()
  const narrativePatterns = [
    /\b([A-Z0-9_-]{6,24})\b\s+IS\s+AVAILABLE\b/g,
    /\b([A-Z0-9_-]{6,24})\b\s+IS\s+LIMITED\b/g,
  ]
  for (const pattern of narrativePatterns) {
    let match: RegExpExecArray | null = null
    while (true) {
      match = pattern.exec(plain)
      if (!match) break
      const token = normalizeCode(match[1] ?? '')
      if (!looksLikeCode(token, true)) continue
      codes.add(token)
    }
  }

  return buildCodeCandidatesFromSet(codes, source, publishedAt)
}

export const game8Source = createCodeSourceAdapter({
  id: 'game8',
  name: 'Game8 Endfield Codes',
  url: 'https://game8.co/games/Arknights-Endfield/archives/571509',
  tier: 'curated',
  extractor: parseGame8Candidates,
  minIntervalMs: 45 * 60 * 1000,
  maxRequestsPerHour: 4,
})

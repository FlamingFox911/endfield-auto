import type {
  CodeCandidate,
  CodeSourceTier,
} from '../../../../core/codes/types.js'

const NON_CODE_TOKENS = new Set([
  'HTTPS',
  'HTTP',
  'WWW',
  'YOUTUBE',
  'ENDMIN',
  'OFFICIAL',
  'CHANNEL',
  'ARTICLE',
  'NEWS',
  'DETAILS',
  'WATCHLIST',
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
  'RELATED',
  'FEATURE',
  'REWARD',
  'CHARACTERS',
  'RECOMMENDED',
  'IN-GAME',
  'INGAME',
  'COPIED',
  'EXPIRED',
  'ACTIVE',
  'CODES',
  'CODE',
])

export interface SourceMetadata {
  id: string
  name: string
  url: string
  tier: CodeSourceTier
}

export type SourceExtractor = (text: string, source: SourceMetadata) => CodeCandidate[]

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
}

export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gis, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

export function stripHtmlWithLineBreaks(input: string): string {
  return decodeEntities(
    input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, '\n')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gis, '\n')
      .replace(/<\/(p|li|h1|h2|h3|h4|h5|h6|tr|div|section|article|ul|ol)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  )
}

export function parseIsoDateOrUndefined(input: string | undefined): string | undefined {
  if (!input) return undefined
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

export function looksLikeCode(raw: string, strongMatch: boolean): boolean {
  const token = normalizeCode(raw)
  if (token.length < 6 || token.length > 24) return false
  if (!/[A-Z]/.test(token)) return false
  if (/^\d+$/.test(token)) return false
  if (NON_CODE_TOKENS.has(token)) return false
  if (!strongMatch && !/\d/.test(token)) return false
  if (token.startsWith('HTTP')) return false
  return true
}

export function buildCodeCandidatesFromSet(
  codes: Set<string>,
  source: SourceMetadata,
  publishedAt?: string,
): CodeCandidate[] {
  return Array.from(codes.values()).map(code => ({
    code,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url,
    sourceTier: source.tier,
    publishedAt,
    referenceUrl: source.url,
  }))
}

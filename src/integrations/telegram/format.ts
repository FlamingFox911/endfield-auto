import type { NotificationPayload } from '../../core/notifications/types.js'

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096
const DISCORD_TIMESTAMP_PATTERN = /<t:(\d+)(?::[tTdDfFR])?>/g
const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const FIELD_LABEL_MAP: Record<string, string> = {
  Username: 'User',
  "Today's Reward": 'Reward',
  Progress: 'Progress',
  Missing: 'Missing',
  Result: 'Result',
  Code: 'Code',
  Confidence: 'Confidence',
  'First Seen': 'First Seen',
  Sources: 'Sources',
  Redeem: 'Redeem',
  'New Codes': 'New Codes',
  Count: 'Count',
  Scan: 'Scan',
  'Checked At': 'Checked',
  Mode: 'Mode',
  Reason: 'Reason',
  'Checked Sources': 'Checked Sources',
  'Skipped Sources': 'Skipped Sources',
  'Notified Codes': 'Notified',
  'Total Known': 'Total Known',
}

export interface TelegramFormatOptions {
  timezone?: string
}

interface DiscordEmbedFieldLike {
  name?: string
  value?: string
}

interface DiscordEmbedLike {
  title?: string
  description?: string
  url?: string
  fields?: DiscordEmbedFieldLike[]
  timestamp?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.toString()
  }
  catch {
    return undefined
  }
}

function resolveTimezone(options?: TelegramFormatOptions): string {
  const timezone = options?.timezone?.trim()
  if (!timezone) return DEFAULT_TIMEZONE
  return timezone
}

function formatDateTime(date: Date, options?: TelegramFormatOptions): string {
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  const timezone = resolveTimezone(options)
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date)
  }
  catch {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date)
  }
}

function normalizeDiscordTimestamp(value: string, options?: TelegramFormatOptions): string {
  return value.replace(DISCORD_TIMESTAMP_PATTERN, (_match, raw) => {
    const tsSeconds = Number(raw)
    if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return 'Unknown'
    const date = new Date(tsSeconds * 1000)
    if (!Number.isFinite(date.getTime())) return 'Unknown'
    return formatDateTime(date, options)
  })
}

function normalizeText(value: string, options?: TelegramFormatOptions): string {
  return normalizeDiscordTimestamp(value, options)
    .replace(/^\s*-\s+/gm, '* ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatLabel(value: string, options?: TelegramFormatOptions): string {
  const normalized = normalizeText(value, options)
  return FIELD_LABEL_MAP[normalized] ?? normalized
}

function escapeTextWithInlineCode(value: string): string {
  const tokens = value.split(/(`[^`\n]+`)/g)
  return tokens
    .map((token) => {
      if (token.length >= 2 && token.startsWith('`') && token.endsWith('`')) {
        return `<code>${escapeHtml(token.slice(1, -1))}</code>`
      }
      return escapeHtml(token)
    })
    .join('')
}

function toEmbed(value: unknown): DiscordEmbedLike | null {
  if (!isRecord(value)) return null
  const fields = Array.isArray(value.fields)
    ? value.fields.filter(isRecord).map((field) => ({
      name: asString(field.name),
      value: asString(field.value),
    }))
    : undefined

  return {
    title: asString(value.title),
    description: asString(value.description),
    url: asString(value.url),
    fields,
    timestamp: asString(value.timestamp),
  }
}

function formatPlainText(value: string, options?: TelegramFormatOptions): string {
  return escapeTextWithInlineCode(normalizeText(value, options))
}

function formatEmbedField(field: DiscordEmbedFieldLike, options?: TelegramFormatOptions): string | null {
  if (!field.name || !field.value) return null
  const label = formatLabel(field.name, options)
  const value = normalizeText(field.value, options)
  return `<b>${escapeHtml(label)}</b>\n${escapeTextWithInlineCode(value)}`
}

function formatEmbed(embed: DiscordEmbedLike, options?: TelegramFormatOptions): string | null {
  const parts: string[] = []

  if (embed.title) {
    const url = safeUrl(embed.url)
    const title = escapeHtml(normalizeText(embed.title, options))
    parts.push(url ? `<b><a href="${escapeHtml(url)}">${title}</a></b>` : `<b>${title}</b>`)
  }

  if (embed.description) {
    parts.push(escapeTextWithInlineCode(normalizeText(embed.description, options)))
  }

  for (const field of embed.fields ?? []) {
    const formatted = formatEmbedField(field, options)
    if (formatted) {
      parts.push(formatted)
    }
  }

  if (embed.timestamp) {
    const date = new Date(embed.timestamp)
    if (Number.isFinite(date.getTime())) {
      parts.push(`<i>Updated ${escapeHtml(formatDateTime(date, options))}</i>`)
    }
  }

  if (parts.length === 0) return null
  return parts.join('\n\n')
}

function splitByLength(value: string, separator: string): string[] {
  if (value.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return [value]

  const units = value.split(separator)
  const chunks: string[] = []
  let current = ''

  for (const unitRaw of units) {
    const unit = unitRaw.trim()
    if (unit.length === 0) continue
    const next = current.length > 0 ? `${current}${separator}${unit}` : unit
    if (next.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      current = next
      continue
    }
    if (current.length > 0) {
      chunks.push(current)
      current = ''
    }
    if (unit.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      current = unit
      continue
    }

    // Fallback hard split for unusually long lines/segments.
    let offset = 0
    while (offset < unit.length) {
      const rest = unit.length - offset
      if (rest <= TELEGRAM_MAX_MESSAGE_LENGTH) {
        current = unit.slice(offset)
        offset = unit.length
        break
      }

      const windowEnd = offset + TELEGRAM_MAX_MESSAGE_LENGTH
      const window = unit.slice(offset, windowEnd)
      const breakAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '))
      if (breakAt > 0) {
        chunks.push(window.slice(0, breakAt).trim())
        offset += breakAt + 1
      }
      else {
        chunks.push(window.trim())
        offset = windowEnd
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks.filter(chunk => chunk.length > 0)
}

function splitChunk(chunk: string): string[] {
  const byParagraph = splitByLength(chunk.trim(), '\n\n')
  return byParagraph.flatMap(part => splitByLength(part, '\n'))
}

export function toTelegramTextMessages(payload: NotificationPayload, options?: TelegramFormatOptions): string[] {
  const chunks: string[] = []

  if (typeof payload === 'string') {
    const text = formatPlainText(payload, options)
    if (text.length > 0) {
      chunks.push(text)
    }
  }
  else {
    if (payload.content) {
      const text = formatPlainText(payload.content, options)
      if (text.length > 0) {
        chunks.push(text)
      }
    }

    if (Array.isArray(payload.embeds)) {
      payload.embeds.forEach((embedValue) => {
        const embed = toEmbed(embedValue)
        if (!embed) return
        const rendered = formatEmbed(embed, options)
        if (rendered && rendered.length > 0) {
          chunks.push(rendered)
        }
      })
    }
  }

  const compact = chunks
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0)

  if (compact.length === 0) {
    return ['Notification received.']
  }

  return compact.flatMap(splitChunk)
}

export function formatTelegramCommandHelp(options: {
  includeCodesCommand: boolean
  includeCodesCheckCommand: boolean
  codeSources?: Array<{ id: string; name: string }>
}): string {
  const lines = [
    'Endfield Auto Commands',
    '/checkin - Run Endfield attendance now',
    '/status - Show current attendance status',
  ]

  if (options.includeCodesCommand) {
    lines.push('/codes [source] - Show tracked redeem codes')
  }
  if (options.includeCodesCheckCommand) {
    lines.push('/codescheck - Run code source check now')
  }

  const sourceIds = options.codeSources
    ?.map(source => source.id.trim())
    .filter(sourceId => sourceId.length > 0) ?? []
  if (sourceIds.length > 0) {
    lines.push(`Sources: ${sourceIds.join(', ')}`)
  }

  lines.push('Use /help to show this message.')
  return lines.join('\n')
}


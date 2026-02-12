import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const DEFAULT_CODE_WATCH_SOURCES = 'game8,destructoid,pocket_tactics'

const optionalString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim().length === 0) return undefined
  return value
}, z.string().optional())

const boolSchema = (defaultValue: boolean) => z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '') return undefined
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return value
}, z.boolean().default(defaultValue))

const integerSchema = (defaultValue: number, minValue: number) => z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.trim().length === 0) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}, z.number().int().min(minValue).default(defaultValue))

const optionalIntegerSchema = (minValue: number) => z.preprocess((value) => {
  if (typeof value === 'string') {
    if (value.trim().length === 0) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}, z.number().int().min(minValue).optional())

const logLevelSchema = z.preprocess((value) => {
  if (typeof value === 'string') return value.toLowerCase()
  return value
}, z.enum(['debug', 'info', 'warn', 'error']).default('info'))

const envSchema = z.object({
  DATA_PATH: z.string().default('.data'),
  PROFILE_PATH: optionalString,
  CRON_SCHEDULE: z.string().default('0 2 * * *'),
  TOKEN_REFRESH_CRON: z.string().default('0 */6 * * *'),
  CODE_WATCH_ENABLED: boolSchema(false),
  CODE_WATCH_MODE: z.enum(['active', 'passive']).default('active'),
  CODE_WATCH_CRON: z.string().default('*/45 * * * *'),
  CODE_WATCH_STARTUP_SCAN: boolSchema(true),
  CODE_WATCH_SOURCES: z.string().default(DEFAULT_CODE_WATCH_SOURCES),
  CODE_WATCH_HTTP_TIMEOUT_MS: integerSchema(10000, 1000),
  CODE_WATCH_LEASE_SECONDS: integerSchema(120, 30),
  CODE_WATCH_MAX_REQUESTS_PER_HOUR: integerSchema(12, 1),
  LOG_LEVEL: logLevelSchema,
  LOG_SUMMARY_PATH: optionalString,
  LOG_DETAIL_PATH: optionalString,
  DISCORD_BOT_TOKEN: optionalString,
  DISCORD_APP_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,
  DISCORD_CHANNEL_ID: optionalString,
  DISCORD_WEBHOOK_URL: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  TELEGRAM_ALLOWED_CHAT_IDS: optionalString,
  TELEGRAM_THREAD_ID: optionalIntegerSchema(1),
  TELEGRAM_POLLING_ENABLED: boolSchema(true),
  TELEGRAM_DISABLE_NOTIFICATION: boolSchema(false),
  TZ: optionalString,
})

export type AppConfig = z.infer<typeof envSchema> & {
  profilePath: string
  logSummaryPath: string
  logDetailPath: string
  codeWatchSourceIds: string[]
  telegramAllowedChatIds: string[]
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env)
  const dataPath = parsed.DATA_PATH
  const profilePath = parsed.PROFILE_PATH
    ? parsed.PROFILE_PATH
    : path.join(dataPath, 'profiles.json')
  const logsPath = path.join(dataPath, 'logs')
  const logSummaryPath = parsed.LOG_SUMMARY_PATH
    ? parsed.LOG_SUMMARY_PATH
    : path.join(logsPath, 'summary.log')
  const logDetailPath = parsed.LOG_DETAIL_PATH
    ? parsed.LOG_DETAIL_PATH
    : path.join(logsPath, 'detail.log')
  const codeWatchSourceIds = Array.from(
    new Set(
      parsed.CODE_WATCH_SOURCES
        .split(',')
        .map(value => value.trim())
        .filter(value => value.length > 0),
    ),
  )

  if (codeWatchSourceIds.length === 0) {
    codeWatchSourceIds.push(...DEFAULT_CODE_WATCH_SOURCES.split(','))
  }

  const telegramAllowedChatIds = Array.from(
    new Set(
      (parsed.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(value => value.length > 0),
    ),
  )
  const telegramChatId = parsed.TELEGRAM_CHAT_ID?.trim()
  if (telegramAllowedChatIds.length === 0 && telegramChatId) {
    telegramAllowedChatIds.push(telegramChatId)
  }

  return {
    ...parsed,
    profilePath,
    logSummaryPath,
    logDetailPath,
    codeWatchSourceIds,
    telegramAllowedChatIds,
  }
}

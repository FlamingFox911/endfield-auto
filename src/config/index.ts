import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const optionalString = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim().length === 0) return undefined
  return value
}, z.string().optional())

const logLevelSchema = z.preprocess((value) => {
  if (typeof value === 'string') return value.toLowerCase()
  return value
}, z.enum(['debug', 'info', 'warn', 'error']).default('info'))

const envSchema = z.object({
  DATA_PATH: z.string().default('.data'),
  PROFILE_PATH: optionalString,
  CRON_SCHEDULE: z.string().default('0 2 * * *'),
  LOG_LEVEL: logLevelSchema,
  LOG_SUMMARY_PATH: optionalString,
  LOG_DETAIL_PATH: optionalString,
  DISCORD_BOT_TOKEN: optionalString,
  DISCORD_APP_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,
  DISCORD_CHANNEL_ID: optionalString,
  DISCORD_WEBHOOK_URL: optionalString,
  TZ: optionalString,
})

export type AppConfig = z.infer<typeof envSchema> & {
  profilePath: string
  logSummaryPath: string
  logDetailPath: string
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

  return {
    ...parsed,
    profilePath,
    logSummaryPath,
    logDetailPath,
  }
}

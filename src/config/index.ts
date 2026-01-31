import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  DATA_PATH: z.string().default('.data'),
  PROFILE_PATH: z.string().optional(),
  CRON_SCHEDULE: z.string().default('0 2 * * *'),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_APP_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  TZ: z.string().optional(),
})

export type AppConfig = z.infer<typeof envSchema> & {
  profilePath: string
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env)
  const dataPath = parsed.DATA_PATH
  const profilePath = parsed.PROFILE_PATH
    ? parsed.PROFILE_PATH
    : path.join(dataPath, 'profiles.json')

  return {
    ...parsed,
    profilePath,
  }
}

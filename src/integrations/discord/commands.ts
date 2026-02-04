import { REST, Routes } from 'discord.js'
import { logger } from '../../utils/logger.js'

const COMMANDS = [
  {
    name: 'checkin',
    description: 'Run Endfield attendance now',
  },
  {
    name: 'status',
    description: 'Show last attendance status',
  },
]

export async function registerCommands(token: string, appId: string, guildId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token)
  logger.debug('Discord command registration request', {
    appId,
    guildId,
    count: COMMANDS.length,
  })
  try {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: COMMANDS })
  }
  catch (error) {
    logger.error('Discord command registration failed', { appId, guildId, error })
    throw error
  }
  logger.debug('Discord command registration completed', { appId, guildId })
}

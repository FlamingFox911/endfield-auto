import { ApplicationCommandOptionType, REST, Routes } from 'discord.js'
import { logger } from '../../utils/logger.js'

const BASE_COMMANDS = [
  {
    name: 'checkin',
    description: 'Run Endfield attendance now',
  },
  {
    name: 'status',
    description: 'Show last attendance status',
  },
]

function formatSourceChoiceName(value: string): string {
  const trimmed = value.replace(/\s+Endfield\s+Codes$/i, '').trim()
  if (trimmed.length === 0) return 'Source'
  if (trimmed.length <= 100) return trimmed
  return `${trimmed.slice(0, 97)}...`
}

function buildCodeCommands(codeSourceChoices: Array<{ id: string; name: string }>) {
  const uniqueChoices = Array.from(
    new Map(
      codeSourceChoices
        .map(source => ({
          name: formatSourceChoiceName(source.name),
          value: source.id.trim(),
        }))
        .filter(source => source.value.length > 0)
        .map(source => [source.value, source]),
    ).values(),
  )
    .slice(0, 25)

  return [
    {
      name: 'codes',
      description: 'Show latest tracked redeem codes',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'source',
          description: 'Filter by one tracked source',
          required: false,
          ...(uniqueChoices.length > 0 ? { choices: uniqueChoices } : {}),
        },
      ],
    },
    {
      name: 'codescheck',
      description: 'Run code source check now',
    },
  ]
}

export interface RegisterCommandsOptions {
  includeCodeCommands?: boolean
  codeSourceChoices?: Array<{ id: string; name: string }>
}

export async function registerCommands(
  token: string,
  appId: string,
  guildId: string,
  options?: RegisterCommandsOptions,
): Promise<void> {
  const commands = options?.includeCodeCommands
    ? BASE_COMMANDS.concat(buildCodeCommands(options?.codeSourceChoices ?? []))
    : BASE_COMMANDS
  const rest = new REST({ version: '10' }).setToken(token)
  logger.debug('Discord command registration request', {
    appId,
    guildId,
    count: commands.length,
    includeCodeCommands: options?.includeCodeCommands === true,
  })
  try {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands })
  }
  catch (error) {
    logger.error('Discord command registration failed', { appId, guildId, error })
    throw error
  }
  logger.debug('Discord command registration completed', { appId, guildId })
}

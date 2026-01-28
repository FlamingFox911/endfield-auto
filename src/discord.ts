import { Client, GatewayIntentBits, REST, Routes } from 'discord.js'
import type { RunResult } from './types.js'
import { logger } from './logger.js'

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
  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: COMMANDS })
}

export interface DiscordStartOptions {
  token: string
  channelId: string
  appId?: string
  guildId?: string
  onCheckIn: () => Promise<RunResult[]>
  getStatus: () => string
}

export async function startDiscordBot(options: DiscordStartOptions): Promise<Client> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', () => {
    logger.info(`Discord bot ready as ${client.user?.tag ?? 'unknown'}`)
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'checkin') {
      await interaction.deferReply({ ephemeral: true })
      const results = await options.onCheckIn()
      const lines = results.map(result => `${result.profileId}: ${result.ok ? 'ok' : 'failed'} - ${result.message}`)
      await interaction.editReply(lines.join('\n'))
      return
    }

    if (interaction.commandName === 'status') {
      await interaction.reply({ content: options.getStatus(), ephemeral: true })
    }
  })

  await client.login(options.token)
  return client
}

export async function sendDiscordMessage(client: Client | null, channelId: string, message: string): Promise<void> {
  if (!client) return
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return
  if (!('send' in channel)) return
  const sendable = channel as { send: (content: string) => Promise<unknown> }
  await sendable.send(message)
}

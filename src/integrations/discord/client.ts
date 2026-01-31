import { Client, GatewayIntentBits } from 'discord.js'
import type { APIEmbed } from 'discord.js'
import { logger } from '../../utils/logger.js'
import type { DiscordMessagePayload, DiscordStartOptions } from './types.js'

function normalizePayload(payload: DiscordMessagePayload): { content?: string; embeds?: APIEmbed[] } {
  if (typeof payload === 'string') {
    return { content: payload }
  }
  return payload
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
      const payload = normalizePayload(await options.onCheckIn())
      await interaction.editReply(payload)
      return
    }

    if (interaction.commandName === 'status') {
      const payload = normalizePayload(await options.getStatus())
      await interaction.reply({ ...payload, ephemeral: true })
    }
  })

  await client.login(options.token)
  return client
}

export async function sendDiscordMessage(client: Client | null, channelId: string, message: DiscordMessagePayload): Promise<void> {
  if (!client) return
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return
  if (!('send' in channel)) return
  const sendable = channel as { send: (payload: { content?: string; embeds?: APIEmbed[] }) => Promise<unknown> }
  const payload = normalizePayload(message)
  await sendable.send(payload)
}

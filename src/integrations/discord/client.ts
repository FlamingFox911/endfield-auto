import { Client, GatewayIntentBits, MessageFlags } from 'discord.js'
import type { APIEmbed } from 'discord.js'
import { logger } from '../../utils/logger.js'
import type { DiscordMessagePayload, DiscordStartOptions } from './types.js'

function normalizePayload(payload: DiscordMessagePayload): { content?: string; embeds?: APIEmbed[] } {
  if (typeof payload === 'string') {
    return { content: payload }
  }
  return payload
}

function unavailableMessage(commandName: string): { content: string } {
  return { content: `${commandName} is not configured on this instance.` }
}

export async function startDiscordBot(options: DiscordStartOptions): Promise<Client> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', () => {
    logger.info(`Discord bot ready as ${client.user?.tag ?? 'unknown'}`)
  })

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return

    if (interaction.commandName === 'checkin') {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const payload = normalizePayload(await options.onCheckIn())
        await interaction.editReply(payload)
      }
      catch (error) {
        logger.warn('Discord checkin command failed', { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    if (interaction.commandName === 'status') {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const payload = normalizePayload(await options.getStatus())
        await interaction.editReply(payload)
      }
      catch (error) {
        logger.warn('Discord status command failed', { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    if (interaction.commandName === 'codes') {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (!options.getCodes) {
          await interaction.editReply(unavailableMessage('/codes'))
          return
        }
        const sourceId = interaction.options.getString('source') ?? undefined
        const payload = normalizePayload(await options.getCodes(sourceId))
        await interaction.editReply(payload)
      }
      catch (error) {
        logger.warn('Discord codes command failed', { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    if (interaction.commandName === 'codescheck') {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (!options.runCodesCheck) {
          await interaction.editReply(unavailableMessage('/codescheck'))
          return
        }
        const payload = normalizePayload(await options.runCodesCheck())
        await interaction.editReply(payload)
      }
      catch (error) {
        logger.warn('Discord codescheck command failed', { error: error instanceof Error ? error.message : String(error) })
      }
    }
  })

  logger.debug('Discord bot login request', { appId: options.appId, guildId: options.guildId })
  await client.login(options.token)
  logger.debug('Discord bot login completed')
  return client
}

export async function sendDiscordMessage(client: Client | null, channelId: string, message: DiscordMessagePayload): Promise<void> {
  if (!client) return
  logger.debug('Discord channel send request', {
    channelId,
    messageType: typeof message === 'string' ? 'text' : 'payload',
  })
  const channel = await client.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) {
    logger.warn('Discord channel fetch failed or not text-based', { channelId })
    return
  }
  if (!('send' in channel)) return
  const sendable = channel as { send: (payload: { content?: string; embeds?: APIEmbed[] }) => Promise<unknown> }
  const payload = normalizePayload(message)
  await sendable.send(payload)
  logger.debug('Discord channel send completed', { channelId })
}

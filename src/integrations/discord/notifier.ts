import type { Client } from 'discord.js'
import type { Notifier, NotificationPayload } from '../../core/notifications/types.js'
import type { DiscordMessagePayload, DiscordStartOptions } from './types.js'
import { registerCommands } from './commands.js'
import { startDiscordBot, sendDiscordMessage } from './client.js'
import { sendWebhook } from './webhook.js'
import { logger } from '../../utils/logger.js'

export interface DiscordNotifierOptions {
  botToken?: string
  appId?: string
  guildId?: string
  channelId?: string
  webhookUrl?: string
  onCheckIn?: DiscordStartOptions['onCheckIn']
  getStatus?: DiscordStartOptions['getStatus']
}

type DiscordMessageBody = Exclude<DiscordMessagePayload, string>

function toDiscordPayload(payload: NotificationPayload): DiscordMessagePayload {
  if (typeof payload === 'string') return payload
  return {
    content: payload.content,
    embeds: payload.embeds as DiscordMessageBody['embeds'],
  }
}

export class DiscordNotifier implements Notifier {
  private client: Client | null = null
  private readonly channelId?: string
  private readonly webhookUrl?: string

  private constructor(options: { channelId?: string; webhookUrl?: string }) {
    this.channelId = options.channelId
    this.webhookUrl = options.webhookUrl
  }

  static async create(options: DiscordNotifierOptions): Promise<DiscordNotifier> {
    const notifier = new DiscordNotifier({
      channelId: options.channelId,
      webhookUrl: options.webhookUrl,
    })

    if (options.botToken && options.channelId) {
      if (options.onCheckIn && options.getStatus) {
        if (options.appId && options.guildId) {
          await registerCommands(options.botToken, options.appId, options.guildId)
        }

        notifier.client = await startDiscordBot({
          token: options.botToken,
          channelId: options.channelId,
          appId: options.appId,
          guildId: options.guildId,
          onCheckIn: options.onCheckIn,
          getStatus: options.getStatus,
        })
      }
      else {
        logger.warn('Discord bot token provided without command handlers; bot not started')
      }
    }
    else if (options.botToken && !options.channelId) {
      logger.warn('Discord bot token provided without channel ID; bot not started')
    }

    return notifier
  }

  async send(payload: NotificationPayload): Promise<void> {
    const discordPayload = toDiscordPayload(payload)
    if (this.webhookUrl) {
      await sendWebhook(this.webhookUrl, discordPayload)
      return
    }

    if (this.client && this.channelId) {
      await sendDiscordMessage(this.client, this.channelId, discordPayload)
      return
    }

    if (typeof payload === 'string') {
      logger.info(payload)
      return
    }

    if (payload.content) {
      logger.info(payload.content)
    }
  }
}

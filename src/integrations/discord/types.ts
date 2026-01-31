import type { APIEmbed } from 'discord.js'

export type DiscordMessagePayload = string | {
  content?: string
  embeds?: APIEmbed[]
}

export interface DiscordStartOptions {
  token: string
  channelId: string
  appId?: string
  guildId?: string
  onCheckIn: () => Promise<DiscordMessagePayload>
  getStatus: () => Promise<DiscordMessagePayload>
}

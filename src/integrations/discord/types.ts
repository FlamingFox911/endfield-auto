import type { APIEmbed } from 'discord.js'

export type DiscordMessagePayload = string | {
  content?: string
  embeds?: APIEmbed[]
}

export interface DiscordStartOptions {
  token: string
  appId?: string
  guildId?: string
  onCheckIn: () => Promise<DiscordMessagePayload>
  getStatus: () => Promise<DiscordMessagePayload>
  getCodes?: (sourceId?: string) => Promise<DiscordMessagePayload>
  runCodesCheck?: () => Promise<DiscordMessagePayload>
}

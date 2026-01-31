import type { DiscordMessagePayload } from './discord.js'
import { getWebhookIdentity } from './discord-format.js'

export async function sendWebhook(
  webhookUrl: string,
  payload: DiscordMessagePayload,
): Promise<void> {
  const identity = getWebhookIdentity()
  const body = typeof payload === 'string' ? { content: payload } : payload
  const webhookBody = {
    ...body,
    username: identity.username,
    avatar_url: identity.avatarUrl,
  }
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(webhookBody),
  })
}

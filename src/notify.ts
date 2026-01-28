import type { DiscordMessagePayload } from './discord.js'

export async function sendWebhook(webhookUrl: string, payload: DiscordMessagePayload): Promise<void> {
  const body = typeof payload === 'string' ? { content: payload } : payload
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

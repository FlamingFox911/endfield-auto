import type { DiscordMessagePayload } from './types.js'
import { getWebhookIdentity } from './format.js'
import { logger } from '../../utils/logger.js'

function sanitizeWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'webhooks') {
      const id = parts[2]
      return `${parsed.origin}/api/webhooks/${id}/***`
    }
    return `${parsed.origin}${parsed.pathname}`
  }
  catch {
    return '[invalid-url]'
  }
}

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
  const safeUrl = sanitizeWebhookUrl(webhookUrl)
  logger.debug('Discord webhook request', {
    method: 'POST',
    url: safeUrl,
    hasContent: Boolean(body.content),
    embedCount: Array.isArray(body.embeds) ? body.embeds.length : 0,
  })

  let response: Response
  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(webhookBody),
    })
  }
  catch (error) {
    logger.error('Discord webhook request failed', { url: safeUrl, error })
    throw error
  }

  logger.debug('Discord webhook response', {
    status: response.status,
    ok: response.ok,
    url: safeUrl,
  })

  if (!response.ok) {
    logger.warn('Discord webhook returned error', {
      status: response.status,
      url: safeUrl,
    })
  }
}

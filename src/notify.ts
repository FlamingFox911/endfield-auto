export async function sendWebhook(webhookUrl: string, content: string): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })
}

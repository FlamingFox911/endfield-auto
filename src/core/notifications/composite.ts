import { logger } from '../../utils/logger.js'
import type { NotificationPayload, Notifier } from './types.js'

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export class CompositeNotifier implements Notifier {
  private readonly notifiers: Notifier[]

  constructor(notifiers: Notifier[]) {
    this.notifiers = notifiers
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (this.notifiers.length === 0) return

    const results = await Promise.allSettled(
      this.notifiers.map(notifier => notifier.send(payload)),
    )

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return
      logger.warn('Notifier delivery failed', {
        notifierIndex: index + 1,
        error: asErrorMessage(result.reason),
      })
    })
  }
}

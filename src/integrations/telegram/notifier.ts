import type { Notifier, NotificationPayload } from '../../core/notifications/types.js'
import { logger } from '../../utils/logger.js'
import { TelegramBotApiClient, TelegramRequestError } from './api.js'
import { startTelegramBot } from './client.js'
import { toTelegramTextMessages } from './format.js'
import type { TelegramCommandHandlers } from './types.js'

const MAX_SEND_ATTEMPTS = 4

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sanitizeChatId(chatId: string): string {
  const trimmed = chatId.trim()
  if (trimmed.length <= 6) return '***'
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`
}

function toAllowedChatIds(value: string[] | undefined, fallbackChatId: string | undefined): string[] {
  const all = [
    ...(value ?? []),
    ...(fallbackChatId ? [fallbackChatId] : []),
  ]
  return Array.from(
    new Set(
      all
        .map(chatId => chatId.trim())
        .filter(chatId => chatId.length > 0),
    ),
  )
}

export interface TelegramNotifierOptions extends TelegramCommandHandlers {
  botToken?: string
  chatId?: string
  allowedChatIds?: string[]
  threadId?: number
  timezone?: string
  pollingEnabled?: boolean
  disableNotification?: boolean
  codeSources?: Array<{ id: string; name: string }>
}

export class TelegramNotifier implements Notifier {
  private readonly api?: TelegramBotApiClient
  private readonly chatId?: string
  private readonly threadId?: number
  private readonly timezone?: string
  private readonly notificationsEnabled: boolean
  private sendChain: Promise<void> = Promise.resolve()

  private constructor(options: {
    api?: TelegramBotApiClient
    chatId?: string
    threadId?: number
    timezone?: string
    notificationsEnabled: boolean
  }) {
    this.api = options.api
    this.chatId = options.chatId
    this.threadId = options.threadId
    this.timezone = options.timezone
    this.notificationsEnabled = options.notificationsEnabled
  }

  static async create(options: TelegramNotifierOptions): Promise<TelegramNotifier> {
    const token = options.botToken?.trim()
    const chatId = options.chatId?.trim()
    const api = token ? new TelegramBotApiClient(token) : undefined
    const notificationsEnabled = Boolean(token && chatId && options.disableNotification !== true)

    const notifier = new TelegramNotifier({
      api,
      chatId,
      threadId: options.threadId,
      timezone: options.timezone,
      notificationsEnabled,
    })

    if (!token) {
      logger.info('Telegram integration not configured')
      return notifier
    }

    if (options.pollingEnabled !== false) {
      const allowedChatIds = toAllowedChatIds(options.allowedChatIds, chatId)
      if (allowedChatIds.length === 0) {
        logger.warn('Telegram polling not started; no allowed chats configured')
      }
      else {
        await startTelegramBot({
          token,
          allowedChatIds,
          codeSources: options.codeSources,
          timezone: options.timezone,
          onCheckIn: options.onCheckIn,
          getStatus: options.getStatus,
          getCodes: options.getCodes,
          runCodesCheck: options.runCodesCheck,
        })
      }
    }
    else {
      logger.info('Telegram polling disabled by configuration')
    }

    if (notificationsEnabled) {
      logger.info('Telegram notifications configured', {
        chatId: sanitizeChatId(chatId as string),
        threadId: options.threadId ?? null,
      })
    }
    else if (options.disableNotification) {
      logger.info('Telegram notifications disabled by configuration')
    }
    else {
      logger.info('Telegram notification target not configured')
    }

    return notifier
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.notificationsEnabled || !this.api || !this.chatId) {
      return
    }

    const chunks = toTelegramTextMessages(payload, {
      timezone: this.timezone,
    })
    if (chunks.length === 0) return

    const run = this.sendChain.then(
      async () => {
        for (const chunk of chunks) {
          await this.sendWithRetry(chunk)
        }
      },
      async () => {
        for (const chunk of chunks) {
          await this.sendWithRetry(chunk)
        }
      },
    )

    this.sendChain = run.catch(() => undefined)
    await run
  }

  private async sendWithRetry(text: string): Promise<void> {
    const api = this.api
    const chatId = this.chatId
    if (!api || !chatId) {
      throw new Error('Telegram notifier is missing API client or chat ID')
    }

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        await api.sendMessage({
          chatId,
          threadId: this.threadId,
          text,
          disableWebPreview: true,
        })
        return
      }
      catch (error) {
        const retryAfter = error instanceof TelegramRequestError ? error.retryAfterSeconds : undefined
        if (typeof retryAfter === 'number' && retryAfter > 0 && retryAfter <= 120 && attempt < MAX_SEND_ATTEMPTS) {
          logger.warn('Telegram send rate-limited; retrying', {
            attempt,
            retryAfterSeconds: retryAfter,
          })
          await sleep((retryAfter + 1) * 1000)
          continue
        }

        if (attempt < MAX_SEND_ATTEMPTS) {
          const backoffMs = Math.min(15_000, attempt * 2_000)
          logger.warn('Telegram send failed; retrying', {
            attempt,
            backoffMs,
            error: asErrorMessage(error),
          })
          await sleep(backoffMs)
          continue
        }

        logger.warn('Telegram send failed', {
          attempts: attempt,
          error: asErrorMessage(error),
        })
        throw error
      }
    }
  }
}

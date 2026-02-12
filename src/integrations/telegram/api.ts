import { logger } from '../../utils/logger.js'
import type {
  TelegramApiResponse,
  TelegramBotCommand,
  TelegramGetUpdatesParams,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from './types.js'

const TELEGRAM_BASE_URL = 'https://api.telegram.org'

function sanitizeToken(token: string): string {
  const trimmed = token.trim()
  if (trimmed.length <= 8) return '***'
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export class TelegramRequestError extends Error {
  readonly method: string
  readonly status?: number
  readonly errorCode?: number
  readonly retryAfterSeconds?: number

  constructor(
    message: string,
    options: {
      method: string
      status?: number
      errorCode?: number
      retryAfterSeconds?: number
      cause?: unknown
    },
  ) {
    super(message, { cause: options.cause })
    this.name = 'TelegramRequestError'
    this.method = options.method
    this.status = options.status
    this.errorCode = options.errorCode
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export class TelegramBotApiClient {
  private readonly baseUrl: string

  constructor(private readonly token: string) {
    this.baseUrl = `${TELEGRAM_BASE_URL}/bot${token}`
    logger.debug('Telegram API client initialized', {
      token: sanitizeToken(token),
    })
  }

  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe')
  }

  async deleteWebhook(dropPendingUpdates = true): Promise<void> {
    await this.request('deleteWebhook', { drop_pending_updates: dropPendingUpdates })
  }

  async setMyCommands(commands: TelegramBotCommand[]): Promise<void> {
    await this.request('setMyCommands', { commands })
  }

  async getUpdates(params: TelegramGetUpdatesParams): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>('getUpdates', params)
  }

  async sendMessage(params: {
    chatId: string | number
    threadId?: number
    text: string
    disableWebPreview?: boolean
  }): Promise<TelegramMessage> {
    return this.request<TelegramMessage>('sendMessage', {
      chat_id: params.chatId,
      message_thread_id: params.threadId,
      text: params.text,
      parse_mode: 'HTML',
      disable_web_page_preview: params.disableWebPreview ?? true,
    })
  }

  private async request<T>(method: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/${method}`
    logger.debug('Telegram API request', {
      method,
      hasBody: Boolean(body),
    })

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }
    catch (error) {
      logger.warn('Telegram API request failed before response', {
        method,
        error: asErrorMessage(error),
      })
      throw new TelegramRequestError('Telegram API network request failed', {
        method,
        cause: error,
      })
    }

    const responseText = await response.text()
    let parsed: TelegramApiResponse<T> | null = null
    if (responseText.length > 0) {
      try {
        parsed = JSON.parse(responseText) as TelegramApiResponse<T>
      }
      catch (error) {
        logger.warn('Telegram API response was not JSON', {
          method,
          status: response.status,
          error: asErrorMessage(error),
        })
      }
    }

    if (!response.ok) {
      const description = parsed && !parsed.ok
        ? parsed.description
        : `Telegram API HTTP ${response.status}`
      const retryAfterSeconds = parsed && !parsed.ok
        ? parsed.parameters?.retry_after
        : undefined
      logger.warn('Telegram API request returned HTTP error', {
        method,
        status: response.status,
        description,
      })
      throw new TelegramRequestError(description, {
        method,
        status: response.status,
        errorCode: parsed && !parsed.ok ? parsed.error_code : undefined,
        retryAfterSeconds,
      })
    }

    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
      throw new TelegramRequestError('Telegram API returned an invalid payload', {
        method,
        status: response.status,
      })
    }

    if (!parsed.ok) {
      logger.warn('Telegram API request returned API error', {
        method,
        status: response.status,
        errorCode: parsed.error_code,
        description: parsed.description,
      })
      throw new TelegramRequestError(parsed.description, {
        method,
        status: response.status,
        errorCode: parsed.error_code,
        retryAfterSeconds: parsed.parameters?.retry_after,
      })
    }

    return parsed.result
  }
}

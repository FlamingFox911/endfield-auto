import type { NotificationPayload } from '../../core/notifications/types.js'

export type TelegramMessagePayload = NotificationPayload

export interface TelegramApiErrorParameters {
  retry_after?: number
  migrate_to_chat_id?: number
}

export interface TelegramApiErrorResponse {
  ok: false
  error_code: number
  description: string
  parameters?: TelegramApiErrorParameters
}

export interface TelegramApiSuccessResponse<T> {
  ok: true
  result: T
}

export type TelegramApiResponse<T> = TelegramApiSuccessResponse<T> | TelegramApiErrorResponse

export interface TelegramUser {
  id: number
  is_bot: boolean
  username?: string
  first_name?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export interface TelegramMessage {
  message_id: number
  date: number
  chat: TelegramChat
  from?: TelegramUser
  text?: string
  message_thread_id?: number
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

export interface TelegramGetUpdatesParams {
  offset?: number
  limit?: number
  timeout?: number
  allowed_updates?: string[]
}

export interface TelegramBotCommand {
  command: string
  description: string
}

export interface TelegramCommandHandlers {
  onCheckIn: () => Promise<TelegramMessagePayload>
  getStatus: () => Promise<TelegramMessagePayload>
  getCodes?: (sourceId?: string) => Promise<TelegramMessagePayload>
  runCodesCheck?: () => Promise<TelegramMessagePayload>
}

export interface TelegramStartOptions extends TelegramCommandHandlers {
  token: string
  allowedChatIds: string[]
  codeSources?: Array<{ id: string; name: string }>
  timezone?: string
}

import { logger } from '../../utils/logger.js'
import { TelegramBotApiClient } from './api.js'
import { formatTelegramCommandHelp, toTelegramTextMessages } from './format.js'
import type { TelegramMessagePayload, TelegramStartOptions, TelegramUpdate } from './types.js'

const POLL_TIMEOUT_SECONDS = 30
const MIN_POLL_BACKOFF_MS = 2000
const MAX_POLL_BACKOFF_MS = 60000

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseCommand(text: string, botUsername?: string): { name: string; args: string[] } | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const [token, ...args] = trimmed.split(/\s+/)
  const [rawName, mention] = token.slice(1).split('@')
  if (!rawName) return null
  if (mention && botUsername && mention.toLowerCase() !== botUsername.toLowerCase()) {
    return null
  }
  return {
    name: rawName.toLowerCase(),
    args,
  }
}

async function sendPayload(
  api: TelegramBotApiClient,
  chatId: string,
  threadId: number | undefined,
  timezone: string | undefined,
  payload: TelegramMessagePayload,
): Promise<void> {
  const chunks = toTelegramTextMessages(payload, { timezone })
  for (const chunk of chunks) {
    await api.sendMessage({
      chatId,
      threadId,
      text: chunk,
      disableWebPreview: true,
    })
  }
}

function unavailableMessage(commandName: string): TelegramMessagePayload {
  return `${commandName} is not configured on this instance.`
}

async function resolveCommandPayload(
  command: { name: string; args: string[] },
  options: TelegramStartOptions,
): Promise<TelegramMessagePayload | null> {
  switch (command.name) {
    case 'start':
    case 'help':
      return formatTelegramCommandHelp({
        includeCodesCommand: Boolean(options.getCodes),
        includeCodesCheckCommand: Boolean(options.runCodesCheck),
        codeSources: options.codeSources,
      })
    case 'checkin':
      return options.onCheckIn()
    case 'status':
      return options.getStatus()
    case 'codes':
      if (!options.getCodes) {
        return unavailableMessage('/codes')
      }
      return options.getCodes(command.args[0])
    case 'codescheck':
      if (!options.runCodesCheck) {
        return unavailableMessage('/codescheck')
      }
      return options.runCodesCheck()
    default:
      return null
  }
}

async function processUpdate(
  api: TelegramBotApiClient,
  update: TelegramUpdate,
  allowedChatIds: Set<string>,
  botUsername: string | undefined,
  options: TelegramStartOptions,
): Promise<void> {
  const message = update.message
  if (!message?.text) return
  const chatId = String(message.chat.id)

  if (!allowedChatIds.has(chatId)) {
    logger.warn('Telegram command ignored from unauthorized chat', {
      chatId,
      updateId: update.update_id,
    })
    return
  }

  const command = parseCommand(message.text, botUsername)
  if (!command) return

  logger.info('Telegram command received', {
    command: command.name,
    chatId,
  })

  try {
    const payload = await resolveCommandPayload(command, options)
    if (!payload) return
    await sendPayload(api, chatId, message.message_thread_id, options.timezone, payload)
  }
  catch (error) {
    logger.warn('Telegram command failed', {
      command: command.name,
      chatId,
      error: asErrorMessage(error),
    })
    await sendPayload(
      api,
      chatId,
      message.message_thread_id,
      options.timezone,
      'Command failed. Check service logs and try again.',
    )
  }
}

export async function startTelegramBot(options: TelegramStartOptions): Promise<void> {
  const allowedChatIds = new Set(
    options.allowedChatIds
      .map(chatId => chatId.trim())
      .filter(chatId => chatId.length > 0),
  )

  if (allowedChatIds.size === 0) {
    logger.warn('Telegram bot not started; no allowed chat IDs configured')
    return
  }

  const api = new TelegramBotApiClient(options.token)
  let botUsername: string | undefined

  try {
    const me = await api.getMe()
    botUsername = me.username
    logger.info('Telegram bot ready', {
      username: me.username ?? '[unknown]',
      id: me.id,
    })
  }
  catch (error) {
    logger.warn('Telegram getMe failed', { error: asErrorMessage(error) })
  }

  try {
    await api.deleteWebhook(true)
  }
  catch (error) {
    logger.warn('Telegram deleteWebhook failed', { error: asErrorMessage(error) })
  }

  try {
    const commands = [
      { command: 'checkin', description: 'Run Endfield attendance now' },
      { command: 'status', description: 'Show attendance status' },
      ...(options.getCodes ? [{ command: 'codes', description: 'Show tracked redeem codes' }] : []),
      ...(options.runCodesCheck ? [{ command: 'codescheck', description: 'Run code source check now' }] : []),
      { command: 'help', description: 'Show available commands' },
    ]
    await api.setMyCommands(commands)
  }
  catch (error) {
    logger.warn('Telegram command registration failed', { error: asErrorMessage(error) })
  }

  void (async () => {
    let nextOffset: number | undefined
    let backoffMs = MIN_POLL_BACKOFF_MS

    while (true) {
      try {
        const updates = await api.getUpdates({
          offset: nextOffset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ['message'],
        })
        backoffMs = MIN_POLL_BACKOFF_MS
        for (const update of updates) {
          nextOffset = update.update_id + 1
          await processUpdate(api, update, allowedChatIds, botUsername, options)
        }
      }
      catch (error) {
        logger.warn('Telegram polling cycle failed', { error: asErrorMessage(error), backoffMs })
        await sleep(backoffMs)
        backoffMs = Math.min(MAX_POLL_BACKOFF_MS, backoffMs * 2)
      }
    }
  })()
}

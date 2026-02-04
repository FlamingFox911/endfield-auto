import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogMeta = Record<string, unknown> | undefined

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

let currentLevel: LogLevel = 'info'
let summaryStream: fs.WriteStream | null = null
let detailStream: fs.WriteStream | null = null

export interface LoggerOptions {
  level: LogLevel
  summaryPath: string
  detailPath: string
}

export async function configureLogger(options: LoggerOptions): Promise<void> {
  currentLevel = options.level

  await fs.promises.mkdir(path.dirname(options.summaryPath), { recursive: true })
  await fs.promises.mkdir(path.dirname(options.detailPath), { recursive: true })

  if (summaryStream) summaryStream.end()
  if (detailStream) detailStream.end()

  summaryStream = fs.createWriteStream(options.summaryPath, { flags: 'a' })
  detailStream = fs.createWriteStream(options.detailPath, { flags: 'a' })
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel]
}

function timestamp(): string {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializeError(error: Error): Record<string, unknown> {
  const cause = error.cause
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: cause instanceof Error ? serializeError(cause) : cause,
  }
}

function toSerializable(value: unknown): unknown {
  if (value instanceof Error) return serializeError(value)
  if (value instanceof Map) return Object.fromEntries(value.entries())
  if (value instanceof Set) return Array.from(value.values())
  if (typeof value === 'bigint') return value.toString()
  return value
}

function safeJson(value: unknown, pretty: boolean): string {
  const seen = new WeakSet<object>()
  const replacer = (_key: string, val: unknown) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]'
      seen.add(val)
    }
    return toSerializable(val)
  }
  return JSON.stringify(value, replacer, pretty ? 2 : 0)
}

function formatMeta(meta: LogMeta, detail: boolean): string | null {
  if (!meta) return null
  const payload = isRecord(meta) ? meta : { value: meta }
  const compact = safeJson(payload, false)
  if (!detail) return compact
  if (compact.length > 200 || compact.includes('\\n')) {
    return safeJson(payload, true)
  }
  return compact
}

function indentLines(value: string, prefix = '  '): string {
  return value
    .split('\n')
    .map(line => `${prefix}${line}`)
    .join('\n')
}

function formatLine(level: LogLevel, message: string, meta: LogMeta, detail: boolean): string {
  const base = `[${timestamp()}] [${level}] ${message}`
  const metaText = formatMeta(meta, detail)
  if (!metaText) return base
  if (!detail) return `${base} | ${metaText}`
  if (!metaText.includes('\n')) return `${base} | ${metaText}`
  return `${base}\n${indentLines(metaText)}`
}

function writeSummary(line: string, level: LogLevel): void {
  if (level === 'error') {
    console.error(line)
  }
  else if (level === 'warn') {
    console.warn(line)
  }
  else {
    console.log(line)
  }

  summaryStream?.write(`${line}\n`)
}

function writeDetail(line: string): void {
  detailStream?.write(`${line}\n`)
}

function log(level: LogLevel, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return
  const summaryLine = formatLine(level, message, meta, false)
  const detailLine = formatLine(level, message, meta, true)
  writeSummary(summaryLine, level)
  writeDetail(detailLine)
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => log('debug', message, meta),
  info: (message: string, meta?: LogMeta) => log('info', message, meta),
  warn: (message: string, meta?: LogMeta) => log('warn', message, meta),
  error: (message: string, meta?: LogMeta) => log('error', message, meta),
}

import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { CodeWatchState } from './types.js'
import { logger } from '../../utils/logger.js'

const sourceTierSchema = z.enum(['official', 'curated', 'community'])

const trackedCodeSourceSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceTier: sourceTierSchema,
  firstSeenAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  publishedAt: z.string().optional(),
  referenceUrl: z.string().optional(),
})

const trackedCodeSchema = z.object({
  code: z.string().min(1),
  firstSeenAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  sources: z.array(trackedCodeSourceSchema).default([]),
  firstNotifiedAt: z.string().optional(),
  lastNotifiedAt: z.string().optional(),
})

const sourceStateSchema = z.object({
  lastCheckedAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  lastEtag: z.string().optional(),
  lastModified: z.string().optional(),
  lastContentHash: z.string().optional(),
  lastStatus: z.number().optional(),
  lastError: z.string().optional(),
  failureCount: z.number().optional(),
  backoffUntil: z.string().optional(),
  windowStartedAt: z.string().optional(),
  windowRequestCount: z.number().optional(),
})

const codeWatchStateSchema = z.object({
  version: z.number().default(1),
  sourceState: z.record(sourceStateSchema).default({}),
  codes: z.record(trackedCodeSchema).default({}),
})

const lockSchema = z.object({
  holder: z.string().min(1),
  expiresAt: z.string().min(1),
  acquiredAt: z.string().min(1),
})

function defaultState(): CodeWatchState {
  return {
    version: 1,
    sourceState: {},
    codes: {},
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}

export class CodeStore {
  private readonly statePath: string
  private readonly lockPath: string
  readonly dataPath: string

  constructor(dataPath: string) {
    this.dataPath = dataPath
    this.statePath = path.join(dataPath, 'codes.json')
    this.lockPath = path.join(dataPath, 'code-watch.lock')
  }

  async load(): Promise<CodeWatchState> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf8')
      const parsed = codeWatchStateSchema.parse(JSON.parse(raw))
      logger.debug('Code state loaded', { path: this.statePath, count: Object.keys(parsed.codes).length })
      return parsed
    }
    catch {
      logger.warn('Code state load failed; using defaults', { path: this.statePath })
      return defaultState()
    }
  }

  async save(state: CodeWatchState): Promise<void> {
    try {
      await fs.mkdir(this.dataPath, { recursive: true })
      const nextState = codeWatchStateSchema.parse({
        version: 1,
        sourceState: state.sourceState ?? {},
        codes: state.codes ?? {},
      })
      await fs.writeFile(this.statePath, JSON.stringify(nextState, null, 2), 'utf8')
      logger.debug('Code state saved', { path: this.statePath, count: Object.keys(nextState.codes).length })
    }
    catch (error) {
      logger.error('Code state save failed', { path: this.statePath, error })
      throw error
    }
  }

  async acquireLease(holder: string, ttlMs: number): Promise<boolean> {
    await fs.mkdir(this.dataPath, { recursive: true })
    const now = Date.now()
    const lease = {
      holder,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    }

    try {
      const handle = await fs.open(this.lockPath, 'wx')
      try {
        await handle.writeFile(JSON.stringify(lease, null, 2), 'utf8')
      }
      finally {
        await handle.close()
      }
      logger.debug('Code watch lease acquired', { holder, path: this.lockPath, mode: 'create' })
      return true
    }
    catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') {
        logger.warn('Code watch lease create failed', { holder, error })
        return false
      }
    }

    try {
      const raw = await fs.readFile(this.lockPath, 'utf8')
      const existing = lockSchema.parse(JSON.parse(raw))
      const expiresAt = new Date(existing.expiresAt).getTime()
      if (Number.isFinite(expiresAt) && expiresAt > now && existing.holder !== holder) {
        logger.debug('Code watch lease held by another instance', {
          holder,
          currentHolder: existing.holder,
          expiresAt: existing.expiresAt,
        })
        return false
      }
    }
    catch (error) {
      logger.warn('Code watch lease parse failed; replacing lock', { holder, error })
    }

    try {
      await fs.writeFile(this.lockPath, JSON.stringify(lease, null, 2), 'utf8')
      logger.debug('Code watch lease acquired', { holder, path: this.lockPath, mode: 'replace' })
      return true
    }
    catch (error) {
      logger.warn('Code watch lease replace failed', { holder, error })
      return false
    }
  }

  async releaseLease(holder: string): Promise<void> {
    try {
      const raw = await fs.readFile(this.lockPath, 'utf8')
      const existing = lockSchema.parse(JSON.parse(raw))
      if (existing.holder !== holder) return
      await fs.rm(this.lockPath)
      logger.debug('Code watch lease released', { holder, path: this.lockPath })
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return
      logger.debug('Code watch lease release skipped', { holder, error })
    }
  }
}

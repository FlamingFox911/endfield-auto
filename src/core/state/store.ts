import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { logger } from '../../utils/logger.js'

const stateSchema = z.object({
  lastSuccessByProfile: z.record(z.string()).default({}),
})

export type AppState = z.infer<typeof stateSchema>

export class StateStore {
  readonly dataPath: string

  constructor(dataPath: string) {
    this.dataPath = dataPath
  }

  async load(): Promise<AppState> {
    const statePath = path.join(this.dataPath, 'state.json')
    try {
      const raw = await fs.readFile(statePath, 'utf8')
      const parsed = stateSchema.parse(JSON.parse(raw))
      logger.debug('State loaded', { path: statePath })
      return parsed
    }
    catch {
      logger.warn('State load failed; using defaults', { path: statePath })
      return stateSchema.parse({})
    }
  }

  async save(state: AppState): Promise<void> {
    const statePath = path.join(this.dataPath, 'state.json')
    try {
      await fs.mkdir(this.dataPath, { recursive: true })
      const nextState: AppState = {
        lastSuccessByProfile: state.lastSuccessByProfile ?? {},
      }
      await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8')
      logger.debug('State saved', { path: statePath })
    }
    catch (error) {
      logger.error('State save failed', { path: statePath, error })
      throw error
    }
  }
}

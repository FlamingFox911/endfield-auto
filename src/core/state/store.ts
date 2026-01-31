import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { nowIso } from '../../utils/time.js'

const stateSchema = z.object({
  lastSuccessByProfile: z.record(z.string()).default({}),
  lastRunByProfile: z.record(z.string()).default({}),
  lastRunAt: z.string().optional(),
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
      return stateSchema.parse(JSON.parse(raw))
    }
    catch {
      return stateSchema.parse({})
    }
  }

  async save(state: AppState): Promise<void> {
    await fs.mkdir(this.dataPath, { recursive: true })
    const statePath = path.join(this.dataPath, 'state.json')
    const nextState: AppState = {
      lastRunAt: nowIso(),
      lastRunByProfile: state.lastRunByProfile ?? {},
      lastSuccessByProfile: state.lastSuccessByProfile ?? {},
    }
    await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8')
  }
}

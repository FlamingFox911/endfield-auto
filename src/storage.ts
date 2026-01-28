import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { nowIso } from './utils.js'

const stateSchema = z.object({
  lastSuccessByProfile: z.record(z.string()).default({}),
  lastRunByProfile: z.record(z.string()).default({}),
  lastRunAt: z.string().optional(),
})

export type AppState = z.infer<typeof stateSchema>

export async function loadState(dataPath: string): Promise<AppState> {
  const statePath = path.join(dataPath, 'state.json')
  try {
    const raw = await fs.readFile(statePath, 'utf8')
    return stateSchema.parse(JSON.parse(raw))
  }
  catch {
    return stateSchema.parse({})
  }
}

export async function saveState(dataPath: string, state: AppState): Promise<void> {
  await fs.mkdir(dataPath, { recursive: true })
  const statePath = path.join(dataPath, 'state.json')
  const nextState: AppState = {
    lastRunAt: nowIso(),
    lastRunByProfile: state.lastRunByProfile ?? {},
    lastSuccessByProfile: state.lastSuccessByProfile ?? {},
  }
  await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8')
}

export async function loadProfilesFile(profilePath: string): Promise<unknown> {
  const raw = await fs.readFile(profilePath, 'utf8')
  return JSON.parse(raw)
}

import type { CodeSourceAdapter } from '../../../core/codes/types.js'
import { destructoidSource } from './destructoid/index.js'
import { game8Source } from './game8/index.js'
import { pocketTacticsSource } from './pocket_tactics/index.js'

const ALL_CODE_SOURCES: CodeSourceAdapter[] = [
  game8Source,
  destructoidSource,
  pocketTacticsSource,
]

const sourceMap = new Map<string, CodeSourceAdapter>(
  ALL_CODE_SOURCES.map(source => [source.id, source]),
)

export const AVAILABLE_CODE_SOURCE_IDS = ALL_CODE_SOURCES.map(source => source.id)

export function resolveCodeSources(sourceIds: string[]): {
  sources: CodeSourceAdapter[]
  unknownSourceIds: string[]
} {
  const sources: CodeSourceAdapter[] = []
  const unknownSourceIds: string[] = []
  for (const id of sourceIds) {
    const source = sourceMap.get(id)
    if (!source) {
      unknownSourceIds.push(id)
      continue
    }
    sources.push(source)
  }
  return { sources, unknownSourceIds }
}

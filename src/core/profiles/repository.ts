import fs from 'node:fs/promises'
import { z } from 'zod'
import type { EndfieldProfile, ProfilesFile } from '../../types/index.js'

const profileSchema = z.object({
  id: z.string().min(1),
  accountName: z.string().optional(),
  cred: z.string().min(1),
  skGameRole: z.string().min(1),
  platform: z.string().min(1),
  vName: z.string().min(1),
  sign: z.string().optional(),
  signToken: z.string().optional(),
  signSecret: z.string().optional(),
  deviceId: z.string().optional(),
})

const profilesFileSchema = z.object({
  profiles: z.array(profileSchema).min(1),
})

export class ProfileRepository {
  readonly profilePath: string

  constructor(profilePath: string) {
    this.profilePath = profilePath
  }

  async load(): Promise<ProfilesFile> {
    const raw = await fs.readFile(this.profilePath, 'utf8')
    const parsed = JSON.parse(raw)
    return profilesFileSchema.parse(parsed) as ProfilesFile
  }

  formatLabel(profile: EndfieldProfile, index?: number): string {
    const name = profile.accountName?.trim()
    if (name) return name
    if (typeof index === 'number') {
      return `Profile ${index}`
    }
    return 'Profile'
  }
}

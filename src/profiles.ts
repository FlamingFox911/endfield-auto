import { z } from 'zod'
import type { EndfieldProfile, ProfilesFile } from './types.js'

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

export function parseProfilesFile(input: unknown): ProfilesFile {
  return profilesFileSchema.parse(input) as ProfilesFile
}

export function formatProfileLabel(profile: EndfieldProfile): string {
  return profile.accountName ? `${profile.id} (${profile.accountName})` : profile.id
}

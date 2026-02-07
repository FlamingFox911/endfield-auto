import type { EndfieldProfile, ProfilesFile } from '../../types/index.js'
import { logger } from '../../utils/logger.js'
import { EndfieldAuthClient } from '../../integrations/endfield/auth.js'
import { ProfileRepository } from '../profiles/repository.js'

export interface AuthServiceOptions {
  authClient: EndfieldAuthClient
  profileRepository: ProfileRepository
  profilesFile: ProfilesFile
  formatProfileLabel: (profile: EndfieldProfile, index?: number) => string
}

function redact(value?: string): string {
  if (!value) return 'none'
  if (value.length <= 8) return `${value.length} chars`
  return `${value.length} chars (ends with ${value.slice(-4)})`
}

export class AuthService {
  private readonly authClient: EndfieldAuthClient
  private readonly profileRepository: ProfileRepository
  private readonly profilesFile: ProfilesFile
  private readonly formatProfileLabel: (profile: EndfieldProfile, index?: number) => string
  private inFlight = false

  constructor(options: AuthServiceOptions) {
    this.authClient = options.authClient
    this.profileRepository = options.profileRepository
    this.profilesFile = options.profilesFile
    this.formatProfileLabel = options.formatProfileLabel
  }

  async refreshIfPossible(targetProfiles?: EndfieldProfile[]): Promise<void> {
    if (this.inFlight) return

    this.inFlight = true
    const profiles = targetProfiles ?? this.profilesFile.profiles
    let changed = false

    try {
      let index = 0
      for (const profile of profiles) {
        index += 1
        const label = this.formatProfileLabel(profile, index)
        logger.info('Refreshing sign token', { profile: label })
        try {
          const signResult = await this.authClient.refreshSignToken(profile)
          const nextToken = signResult.signToken

          if (nextToken && profile.signToken !== nextToken) {
            logger.info('Sign token updated', {
              profile: label,
              before: redact(profile.signToken),
              after: redact(nextToken),
            })
            profile.signToken = nextToken
            changed = true
          }

        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn('Sign token refresh failed', { profile: label, error: message })
        }
      }

      if (changed) {
        await this.profileRepository.save(this.profilesFile)
      }
    }
    finally {
      this.inFlight = false
    }
  }
}

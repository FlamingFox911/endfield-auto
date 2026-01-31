import type { AttendanceResult, AttendanceStatus, EndfieldProfile } from '../../types/index.js'

export type RunReason = 'startup' | 'scheduled' | 'manual'

export interface AttendanceClient {
  fetchStatus(profile: EndfieldProfile): Promise<AttendanceStatus>
  attend(profile: EndfieldProfile): Promise<AttendanceResult>
}

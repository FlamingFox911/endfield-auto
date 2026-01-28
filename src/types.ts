export interface EndfieldProfile {
  id: string
  accountName?: string
  cred: string
  skGameRole: string
  platform: string
  vName: string
  sign?: string
  signToken?: string
  signSecret?: string
  deviceId?: string
}

export interface ProfilesFile {
  profiles: EndfieldProfile[]
}

export interface AttendanceResult {
  ok: boolean
  already?: boolean
  message: string
  rewards?: string[]
}

export interface AttendanceRecordItem {
  ts: string
  awardId: string
}

export interface AttendanceRecordResponse {
  code: number
  message: string
  timestamp: string
  data?: {
    records?: AttendanceRecordItem[]
    resourceInfoMap?: Record<string, unknown>
  }
}


export interface RunResult {
  profileId: string
  ok: boolean
  already?: boolean
  message: string
}


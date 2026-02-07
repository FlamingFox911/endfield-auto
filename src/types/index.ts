export interface EndfieldProfile {
  id: string
  accountName?: string
  cred: string
  skGameRole: string
  platform: string
  vName: string
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
  rewards?: AttendanceReward[]
  status?: AttendanceStatus
}

export interface AttendanceCalendarItem {
  awardId: string
  available: boolean
  done: boolean
}

export interface AttendanceResourceInfo {
  id: string
  count: number
  name: string
  icon: string
}

export interface AttendanceResponse {
  code: number
  message: string
  timestamp: string
  data?: {
    currentTs?: string
    calendar?: AttendanceCalendarItem[]
    first?: AttendanceCalendarItem[]
    resourceInfoMap?: Record<string, AttendanceResourceInfo>
    hasToday?: boolean
  }
}

export interface AttendanceReward {
  id?: string
  name: string
  count?: number
  icon?: string
}

export interface AttendanceStatus {
  ok: boolean
  message: string
  hasToday?: boolean
  doneCount?: number
  totalCount?: number
  missingCount?: number
  todayRewards?: AttendanceReward[]
}


export interface RunResult {
  profileId: string
  profileLabel?: string
  ok: boolean
  already?: boolean
  message: string
  rewards?: AttendanceReward[]
  status?: AttendanceStatus
}


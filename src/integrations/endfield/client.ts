import type {
  AttendanceResponse,
  AttendanceResult,
  AttendanceCalendarItem,
  AttendanceReward,
  AttendanceResourceInfo,
  AttendanceStatus,
  EndfieldProfile,
} from '../../types/index.js'
import type { AttendanceClient } from '../../core/attendance/types.js'
import { logger } from '../../utils/logger.js'
import { buildSignHeaders } from './sign.js'
import { buildHeaders, ATTENDANCE_URL } from './headers.js'
import { getShanghaiDate, getShanghaiDateFromUnixSeconds } from '../../utils/time.js'

function rewardFromResourceInfo(info: AttendanceResourceInfo | undefined): AttendanceReward | null {
  if (!info) return null
  return {
    id: info.id,
    name: info.name,
    count: info.count,
    icon: info.icon,
  }
}

function rewardsFromAwardIds(awardIds: Array<{ id?: string }> | undefined, map?: Record<string, AttendanceResourceInfo>): AttendanceReward[] {
  if (!Array.isArray(awardIds)) return []
  return awardIds
    .map(entry => (entry?.id ? rewardFromResourceInfo(map?.[entry.id]) : null))
    .filter((reward): reward is AttendanceReward => Boolean(reward))
}

function rewardsFromAwards(awards: Array<{ name?: string; count?: number; amount?: number; resource?: { name?: string; icon?: string } }> | undefined): AttendanceReward[] {
  if (!Array.isArray(awards)) return []
  return awards
    .map((award): AttendanceReward | null => {
      const name = award?.name ?? award?.resource?.name
      if (!name) return null
      const count = award?.count ?? award?.amount
      const reward: AttendanceReward = { name }
      if (typeof count === 'number') {
        reward.count = count
      }
      if (award?.resource?.icon) {
        reward.icon = award.resource.icon
      }
      return reward
    })
    .filter((reward): reward is AttendanceReward => reward !== null)
}

function parseDayOfMonth(dateString: string): number | null {
  const parts = dateString.split('-')
  if (parts.length !== 3) return null
  const day = Number(parts[2])
  return Number.isFinite(day) ? day : null
}

function getShanghaiDayOfMonth(currentTs?: string): number | null {
  const dateString = currentTs ? getShanghaiDateFromUnixSeconds(currentTs) : getShanghaiDate()
  return parseDayOfMonth(dateString)
}

function countMissedDays(calendar: AttendanceCalendarItem[], todayDay: number | null): number {
  if (!todayDay) {
    return calendar.filter(item => !item.done).length
  }
  const cappedIndex = Math.min(Math.max(todayDay - 1, 0), calendar.length)
  return calendar.slice(0, cappedIndex).filter(item => !item.done).length
}

export class EndfieldClient implements AttendanceClient {
  async fetchStatus(profile: EndfieldProfile): Promise<AttendanceStatus> {
    const signHeaders = buildSignHeaders(profile, ATTENDANCE_URL, 'GET')
    const headers = buildHeaders(profile, signHeaders)
    logger.debug('Endfield status request', {
      method: 'GET',
      url: ATTENDANCE_URL,
      profileId: profile.id,
    })

    let response: Response
    try {
      response = await fetch(ATTENDANCE_URL, {
        method: 'GET',
        headers,
      })
    }
    catch (error) {
      logger.error('Endfield status request failed', { profileId: profile.id, error })
      throw error
    }
    logger.debug('Endfield status response', {
      status: response.status,
      ok: response.ok,
      profileId: profile.id,
    })

    const text = await response.text()
    let payload: AttendanceResponse | null = null
    try {
      payload = JSON.parse(text)
    }
    catch {
      payload = null
    }

    if (!response.ok) {
      logger.warn('Endfield status request returned error', {
        status: response.status,
        profileId: profile.id,
      })
      return { ok: false, message: `HTTP ${response.status}` }
    }

    if (!payload) {
      logger.warn('Endfield status response not JSON', { profileId: profile.id })
      return { ok: false, message: 'Invalid attendance response' }
    }

    if (payload.code !== 0) {
      logger.warn('Endfield status returned non-zero code', {
        profileId: profile.id,
        code: payload.code,
        message: payload.message,
      })
      return { ok: false, message: payload.message ?? 'Attendance status failed' }
    }

    const calendar = payload.data?.calendar ?? []
    const doneCount = calendar.filter(item => item.done).length
    const totalCount = calendar.length
    const todayDay = getShanghaiDayOfMonth(payload.data?.currentTs)
    const missingCount = countMissedDays(calendar, todayDay)
    const todayRewards = calendar
      .filter(item => item.available)
      .map(item => rewardFromResourceInfo(payload.data?.resourceInfoMap?.[item.awardId]))
      .filter((reward): reward is AttendanceReward => Boolean(reward))

    return {
      ok: true,
      message: payload.message ?? 'OK',
      hasToday: payload.data?.hasToday,
      doneCount,
      totalCount,
      missingCount,
      todayRewards: todayRewards.length > 0 ? todayRewards : undefined,
    }
  }

  async attend(profile: EndfieldProfile): Promise<AttendanceResult> {
    const status = await this.fetchStatus(profile)
    if (status.ok && status.hasToday === true) {
      return {
        ok: false,
        already: true,
        message: 'Already checked in today',
        status,
      }
    }

    const body = '{}'
    const signHeaders = buildSignHeaders(profile, ATTENDANCE_URL, 'POST', body)
    const headers = buildHeaders(profile, signHeaders)

    logger.debug('Endfield attendance request', {
      method: 'POST',
      url: ATTENDANCE_URL,
      profileId: profile.id,
    })

    let response: Response
    try {
      response = await fetch(ATTENDANCE_URL, {
        method: 'POST',
        headers,
        body,
      })
    }
    catch (error) {
      logger.error('Endfield attendance request failed', { profileId: profile.id, error })
      throw error
    }
    logger.debug('Endfield attendance response', {
      status: response.status,
      ok: response.ok,
      profileId: profile.id,
    })

    const text = await response.text()
    let payload: any = null
    try {
      payload = JSON.parse(text)
    }
    catch {
      payload = { raw: text }
    }

    if (!response.ok) {
      logger.warn('Attendance request failed', { status: response.status })
      return {
        ok: false,
        message: `HTTP ${response.status}: ${payload?.msg ?? payload?.message ?? 'Request failed'}`,
        status,
      }
    }

    const code = payload?.code ?? payload?.retcode
    const msg = payload?.msg ?? payload?.message ?? 'Attendance response received'

    if (code === 0) {
      const rewards = rewardsFromAwardIds(payload?.data?.awardIds, payload?.data?.resourceInfoMap)
        .concat(rewardsFromAwards(payload?.data?.awards))

      let nextStatus = status
      if (status.ok) {
        const doneCount = typeof status.doneCount === 'number' ? Math.min(status.doneCount + 1, status.totalCount ?? status.doneCount + 1) : undefined
        nextStatus = {
          ...status,
          hasToday: true,
          doneCount,
          missingCount: status.missingCount,
          todayRewards: undefined,
        }
      }

      const message = msg === 'OK' ? 'Check-in successful' : msg

      return {
        ok: true,
        message,
        rewards: rewards.length > 0 ? rewards : undefined,
        status: nextStatus,
      }
    }

    const already = typeof msg === 'string'
      && msg.toLowerCase().includes('already')

    const nextStatus = (already && status.ok)
      ? { ...status, hasToday: true, todayRewards: undefined }
      : status

    logger.warn('Endfield attendance returned non-zero code', {
      profileId: profile.id,
      code,
      message: msg,
    })

    return {
      ok: false,
      already,
      message: msg,
      status: nextStatus,
    }
  }
}

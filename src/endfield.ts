import type {
  AttendanceResponse,
  AttendanceResult,
  AttendanceReward,
  AttendanceResourceInfo,
  AttendanceStatus,
  EndfieldProfile,
} from './types.js'
import { logger } from './logger.js'
import { buildSignHeaders } from './sign.js'

const ATTENDANCE_URL = 'https://zonai.skport.com/web/v1/game/endfield/attendance'
const ORIGIN = 'https://game.skport.com'
const REFERER = 'https://game.skport.com/'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
const ACCEPT_LANGUAGE = 'en-CA,en-US;q=0.9,en;q=0.8,fr-CA;q=0.7'
const ACCEPT_ENCODING = 'gzip, deflate, br, zstd'
const DNT = '1'
const PRIORITY = 'u=4'
const SK_LANGUAGE = 'en'
const SEC_FETCH_DEST = 'empty'
const SEC_FETCH_MODE = 'cors'
const SEC_FETCH_SITE = 'same-site'
const TE = 'trailers'

function buildHeaders(profile: EndfieldProfile, signHeaders: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    cred: profile.cred,
    'sk-game-role': profile.skGameRole,
    ...signHeaders,
    accept: '*/*',
    'content-type': 'application/json',
    origin: ORIGIN,
    referer: REFERER,
    'user-agent': USER_AGENT,
    'accept-language': ACCEPT_LANGUAGE,
    'accept-encoding': ACCEPT_ENCODING,
    dnt: DNT,
    priority: PRIORITY,
    'sk-language': SK_LANGUAGE,
    'sec-fetch-dest': SEC_FETCH_DEST,
    'sec-fetch-mode': SEC_FETCH_MODE,
    'sec-fetch-site': SEC_FETCH_SITE,
    te: TE,
  }

  if (!headers.sign && profile.sign) {
    headers.sign = profile.sign
  }

  return headers
}

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

export async function fetchAttendanceStatus(profile: EndfieldProfile): Promise<AttendanceStatus> {
  const signHeaders = buildSignHeaders(profile, ATTENDANCE_URL, 'GET')
  const headers = buildHeaders(profile, signHeaders)
  const response = await fetch(ATTENDANCE_URL, {
    method: 'GET',
    headers,
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
    return { ok: false, message: `HTTP ${response.status}` }
  }

  if (!payload) {
    return { ok: false, message: 'Invalid attendance response' }
  }

  if (payload.code !== 0) {
    return { ok: false, message: payload.message ?? 'Attendance status failed' }
  }

  const calendar = payload.data?.calendar ?? []
  const doneCount = calendar.filter(item => item.done).length
  const totalCount = calendar.length
  const missingCount = totalCount - doneCount
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

export async function attend(profile: EndfieldProfile): Promise<AttendanceResult> {
  const status = await fetchAttendanceStatus(profile)
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

  const response = await fetch(ATTENDANCE_URL, {
    method: 'POST',
    headers,
    body,
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
      const totalCount = status.totalCount
      nextStatus = {
        ...status,
        hasToday: true,
        doneCount,
        missingCount: typeof totalCount === 'number' && typeof doneCount === 'number'
          ? Math.max(totalCount - doneCount, 0)
          : status.missingCount,
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

  return {
    ok: false,
    already,
    message: msg,
    status: nextStatus,
  }
}

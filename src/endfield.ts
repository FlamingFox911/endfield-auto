import type { AttendanceRecordResponse, AttendanceResult, EndfieldProfile } from './types.js'
import { logger } from './logger.js'
import { getShanghaiDate, getShanghaiDateFromUnixSeconds } from './utils.js'
import { buildSignHeaders } from './sign.js'

const ATTENDANCE_URL = 'https://zonai.skport.com/web/v1/game/endfield/attendance'
const ATTENDANCE_RECORD_URL = 'https://zonai.skport.com/web/v1/game/endfield/attendance/record'
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

function isAlreadyFromRecords(payload: AttendanceRecordResponse): boolean {
  const today = getShanghaiDate()
  const records = payload?.data?.records ?? []
  return records.some(record => getShanghaiDateFromUnixSeconds(record.ts) === today)
}

async function fetchAttendanceRecord(profile: EndfieldProfile): Promise<{ ok: boolean; already?: boolean; message?: string }> {
  const signHeaders = buildSignHeaders(profile, ATTENDANCE_RECORD_URL, 'GET')
  const headers = buildHeaders(profile, signHeaders)
  const response = await fetch(ATTENDANCE_RECORD_URL, {
    method: 'GET',
    headers,
  })

  const text = await response.text()
  let payload: AttendanceRecordResponse | null = null
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
    return { ok: false, message: 'Invalid record response' }
  }

  const already = isAlreadyFromRecords(payload)

  return { ok: true, already, message: payload.message }
}

export async function attend(profile: EndfieldProfile): Promise<AttendanceResult> {
  const record = await fetchAttendanceRecord(profile)
  if (record.ok && record.already) {
    return {
      ok: false,
      already: true,
      message: record.message ?? 'Already checked in',
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
    }
  }

  const code = payload?.code ?? payload?.retcode
  const msg = payload?.msg ?? payload?.message ?? 'Attendance response received'

  if (code === 0) {
    let rewards: string[] | undefined

    if (Array.isArray(payload?.data?.awardIds) && payload?.data?.resourceInfoMap) {
      const map = payload.data.resourceInfoMap
      rewards = payload.data.awardIds
        .map((entry: any) => map?.[entry?.id])
        .filter(Boolean)
        .map((info: any) => `${info?.name ?? 'reward'} x${info?.count ?? ''}`.trim())
    }
    else if (Array.isArray(payload?.data?.awards)) {
      rewards = payload.data.awards
        .map((award: any) => `${award?.name ?? award?.resource?.name ?? 'reward'} x${award?.count ?? award?.amount ?? ''}`.trim())
    }

    return {
      ok: true,
      message: msg,
      rewards,
    }
  }

  const already = typeof msg === 'string'
    && msg.toLowerCase().includes('already')

  return {
    ok: false,
    already,
    message: msg,
  }
}

import type { EndfieldProfile } from '../../types/index.js'

export const ATTENDANCE_URL = 'https://zonai.skport.com/web/v1/game/endfield/attendance'
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

export function buildHeaders(profile: EndfieldProfile, signHeaders: Record<string, string>): Record<string, string> {
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

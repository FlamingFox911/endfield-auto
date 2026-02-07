import type { EndfieldProfile } from '../../types/index.js'

const AUTH_REFRESH_URL = 'https://zonai.skport.com/web/v1/auth/refresh'
const ORIGIN = 'https://game.skport.com'
const REFERER = 'https://game.skport.com/'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
const SK_LANGUAGE = 'en'

export type AuthRefreshResult = {
  signToken: string
}

type SignRefreshResponse = {
  code?: number
  message?: string
  timestamp?: string
  data?: { token?: string }
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  }
  catch {
    const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text
    throw new Error(`Invalid JSON from ${label}: ${preview}`)
  }
}

function buildBaseHeaders(): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    origin: ORIGIN,
    referer: REFERER,
    'user-agent': USER_AGENT,
  }
}

export class EndfieldAuthClient {
  async refreshSignToken(profile: EndfieldProfile): Promise<AuthRefreshResult> {
    const headers = {
      ...buildBaseHeaders(),
      'content-type': 'application/json',
      'sk-language': SK_LANGUAGE,
      cred: profile.cred,
      platform: profile.platform,
      vName: profile.vName,
    }

    const response = await fetch(AUTH_REFRESH_URL, { method: 'GET', headers })
    if (!response.ok) {
      throw new Error(`Auth refresh HTTP ${response.status}`)
    }

    const payload = await parseJson<SignRefreshResponse>(response, 'auth_refresh')
    if (payload.code !== 0) {
      throw new Error(`Auth refresh error: ${payload.message ?? 'unknown error'}`)
    }

    const token = payload.data?.token
    if (!token) {
      throw new Error('Auth refresh missing token')
    }

    return {
      signToken: token,
    }
  }
}

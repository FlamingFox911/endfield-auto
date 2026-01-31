import crypto from 'node:crypto'
import type { EndfieldProfile } from '../../types/index.js'

type SignInput = {
  url: string
  method: string
  body?: string
  timestamp: string
  platform: string
  vName: string
  deviceId?: string
  key: string
}

function buildSignPayload(input: SignInput): string {
  const url = new URL(input.url)
  const path = url.pathname
  const query = url.search ? url.search.slice(1) : ''
  const method = input.method.toUpperCase()
  const body = input.body ?? ''

  let source = ''
  source += path
  source += method === 'GET' ? query : body
  source += input.timestamp

  const payload = {
    platform: input.platform,
    timestamp: input.timestamp,
    dId: input.deviceId ?? '',
    vName: input.vName,
  }

  source += JSON.stringify(payload)

  return source
}

export function computeSignHeader(profile: EndfieldProfile, url: string, method: string, body?: string): string | null {
  const key = profile.signSecret || profile.signToken
  if (!key) return null

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const input: SignInput = {
    url,
    method,
    body,
    timestamp,
    platform: profile.platform,
    vName: profile.vName,
    deviceId: profile.deviceId,
    key,
  }

  const source = buildSignPayload(input)
  const hmacHex = crypto.createHmac('sha256', input.key).update(source).digest('hex')
  const sign = crypto.createHash('md5').update(hmacHex).digest('hex')

  return sign
}

export function buildSignHeaders(profile: EndfieldProfile, url: string, method: string, body?: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const headers: Record<string, string> = {
    platform: profile.platform,
    vName: profile.vName,
    timestamp,
  }

  if (profile.deviceId) {
    headers.dId = profile.deviceId
  }

  const key = profile.signSecret || profile.signToken
  if (key) {
    const source = buildSignPayload({
      url,
      method,
      body,
      timestamp,
      platform: profile.platform,
      vName: profile.vName,
      deviceId: profile.deviceId,
      key,
    })
    const hmacHex = crypto.createHmac('sha256', key).update(source).digest('hex')
    headers.sign = crypto.createHash('md5').update(hmacHex).digest('hex')
  }

  return headers
}

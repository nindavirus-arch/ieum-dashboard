const crypto = require('node:crypto')

const DEFAULT_AUTH_URL =
  'https://script.google.com/macros/s/AKfycbx4AuPxsyuOh2PZMFKE_TBZExkFlTABJ80HeQYmKrWI1BqPJZFZCGH6DQqoGsMlyMGeNQ/exec'

const cache = new Map()
const SESSION_COOKIE = 'ieum_dashboard_api_session'
const SESSION_TTL_SECONDS = 5 * 60

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function sessionSecret() {
  return String(
    process.env.DASHBOARD_SESSION_SECRET ||
    process.env.MANAGEMENT_API_KEY ||
    process.env.SYNC_ADMIN_TOKEN ||
    ''
  ).trim()
}

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex')
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';')
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=')
    if (separator < 0) continue
    if (cookie.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(cookie.slice(separator + 1).trim())
  }
  return ''
}

function hasValidSessionCookie(req, token) {
  const secret = sessionSecret()
  if (!secret || !token) return false
  const parts = cookieValue(req, SESSION_COOKIE).split('.')
  if (parts.length !== 3) return false
  const [expiresRaw, fingerprint, signature] = parts
  const expires = Number(expiresRaw)
  if (!Number.isFinite(expires) || expires <= Date.now()) return false
  if (fingerprint !== tokenFingerprint(token)) return false
  const expected = sign(`${expiresRaw}.${fingerprint}`)
  if (signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

function setSessionCookie(res, token) {
  if (!res || !sessionSecret() || !token) return
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000
  const fingerprint = tokenFingerprint(token)
  const value = `${expires}.${fingerprint}.${sign(`${expires}.${fingerprint}`)}`
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/api; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`)
}

async function verifyDashboardSession(req, res) {
  const token = bearerToken(req)
  if (!token) return false
  if (hasValidSessionCookie(req, token)) return true
  const cached = cache.get(token)
  if (cached && cached.expires > Date.now()) {
    if (cached.valid) setSessionCookie(res, token)
    return cached.valid
  }

  const authUrl = String(process.env.APPS_SCRIPT_AUTH_URL || DEFAULT_AUTH_URL).trim()
  const url = new URL(authUrl)
  url.searchParams.set('type', 'authStatus')
  url.searchParams.set('token', token)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    const body = await response.json()
    const valid = response.ok && !body?.error && Boolean(body?.user)
    cache.set(token, { valid, expires: Date.now() + (valid ? 5 * 60_000 : 30_000) })
    if (valid) setSessionCookie(res, token)
    return valid
  } catch {
    return false
  }
}

module.exports = { verifyDashboardSession }

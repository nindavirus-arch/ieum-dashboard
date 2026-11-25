const DEFAULT_AUTH_URL =
  'https://script.google.com/macros/s/AKfycbx4AuPxsyuOh2PZMFKE_TBZExkFlTABJ80HeQYmKrWI1BqPJZFZCGH6DQqoGsMlyMGeNQ/exec'

const cache = new Map()

function bearerToken(req) {
  const header = String(req.headers.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

async function verifyDashboardSession(req) {
  const token = bearerToken(req)
  if (!token) return false
  const cached = cache.get(token)
  if (cached && cached.expires > Date.now()) return cached.valid

  const authUrl = String(process.env.APPS_SCRIPT_AUTH_URL || DEFAULT_AUTH_URL).trim()
  const url = new URL(authUrl)
  url.searchParams.set('type', 'authStatus')
  url.searchParams.set('token', token)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    const body = await response.json()
    const valid = response.ok && !body?.error && Boolean(body?.user)
    cache.set(token, { valid, expires: Date.now() + (valid ? 5 * 60_000 : 30_000) })
    return valid
  } catch {
    return false
  }
}

module.exports = { verifyDashboardSession }

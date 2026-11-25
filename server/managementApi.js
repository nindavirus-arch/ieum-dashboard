const DEFAULT_BASE_URL = 'https://ieumwindow.kr/api/v1/dashboard'

function apiConfig() {
  const baseUrl = String(process.env.MANAGEMENT_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const apiKey = String(process.env.MANAGEMENT_API_KEY || '').trim()
  if (!apiKey) throw new Error('MANAGEMENT_API_KEY is not configured')
  return { baseUrl, apiKey }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchManagementPage(endpoint, params = {}) {
  const { baseUrl, apiKey } = apiConfig()
  const url = new URL(`${baseUrl}/${endpoint}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })

  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'X-API-Key': apiKey },
        signal: controller.signal,
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success || !Array.isArray(body?.data)) {
        const error = new Error(body?.error?.message || body?.message || `management API ${response.status}`)
        error.status = response.status
        throw error
      }
      return body
    } catch (error) {
      lastError = error
      const retryable = error?.name === 'AbortError' || !error?.status || error.status === 429 || error.status >= 500
      if (!retryable || attempt === 2) break
      await wait(500 * (2 ** attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

module.exports = { fetchManagementPage }

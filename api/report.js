const DEFAULT_APPS_SCRIPT_REPORT_URL =
  'https://script.google.com/macros/s/AKfycbx4AuPxsyuOh2PZMFKE_TBZExkFlTABJ80HeQYmKrWI1BqPJZFZCGH6DQqoGsMlyMGeNQ/exec'

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Report-Token')
  res.end(JSON.stringify(data))
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
}

function hasProxyAccess(req) {
  const expected = process.env.REPORT_PROXY_TOKEN
  if (!expected) return false

  const queryToken =
    firstQueryValue(req.query?.token) ||
    firstQueryValue(req.query?.reportToken) ||
    firstQueryValue(req.query?.readToken)
  const headerToken = req.headers['x-report-token']
  return String(queryToken || headerToken || '') === expected
}

module.exports = async function reportProxy(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { success: true })
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'method not allowed' })
  }

  if (!hasProxyAccess(req)) {
    return sendJson(res, 403, { success: false, error: 'forbidden' })
  }

  const from = normalizeDate(firstQueryValue(req.query?.from))
  const to = normalizeDate(firstQueryValue(req.query?.to))
  if (!from || !to) {
    return sendJson(res, 400, { success: false, error: 'from/to required. Use YYYY-MM-DD.' })
  }
  if (from > to) {
    return sendJson(res, 400, { success: false, error: 'invalid range' })
  }

  const appsScriptUrl = String(process.env.APPS_SCRIPT_REPORT_URL || DEFAULT_APPS_SCRIPT_REPORT_URL).trim()
  const appsScriptToken = String(process.env.APPS_SCRIPT_REPORT_TOKEN || '').trim()
  if (!appsScriptToken) {
    return sendJson(res, 500, { success: false, error: 'APPS_SCRIPT_REPORT_TOKEN is not configured' })
  }

  const url = new URL(appsScriptUrl)
  url.searchParams.set('action', 'report')
  url.searchParams.set('reportToken', appsScriptToken)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return sendJson(res, 502, {
        success: false,
        error: 'upstream did not return JSON',
        upstreamStatus: response.status,
      })
    }

    if (!response.ok || data?.error) {
      return sendJson(res, response.ok ? 502 : response.status, {
        success: false,
        error: data?.error || 'upstream error',
        upstreamStatus: response.status,
      })
    }

    return sendJson(res, 200, {
      ...data,
      proxiedBy: 'vercel',
      proxyPrivacy: {
        appsScriptTokenExposed: false,
        personalDataIncluded: false,
      },
    })
  } catch (error) {
    return sendJson(res, 502, {
      success: false,
      error: 'failed to fetch report upstream',
      message: String(error?.message || error),
    })
  }
}

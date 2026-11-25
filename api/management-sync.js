const { fetchManagementPage } = require('../server/managementApi')
const { verifyDashboardSession } = require('../server/dashboardAuth')
const {
  getSyncState,
  releaseSyncLock,
  saveSyncError,
  saveSyncSuccess,
  trySyncLock,
  upsertRecords,
} = require('../server/managementStore')

const ENDPOINTS = ['consultings', 'consulting-utms', 'projects']

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function isAuthorized(req, res) {
  const expected = String(process.env.CRON_SECRET || process.env.SYNC_ADMIN_TOKEN || '').trim()
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (expected && (bearer === expected || String(req.headers['x-sync-token'] || '') === expected)) return true
  return verifyDashboardSession(req, res)
}

function maxUpdatedAt(current, rows) {
  return rows.reduce((max, row) => {
    const value = String(row.updatedAt || '')
    if (!value) return max
    if (!max) return value
    return new Date(value).getTime() > new Date(max).getTime() ? value : max
  }, current || '')
}

async function syncEndpoint(endpoint, forceFull) {
  const state = await getSyncState(endpoint)
  const stateUpdatedAt = state?.last_source_updated_at
  const stateValue = stateUpdatedAt instanceof Date ? stateUpdatedAt.toISOString() : String(stateUpdatedAt || '')
  const updatedFrom = forceFull || !stateValue
    ? ''
    : new Date(new Date(stateValue).getTime() - 60_000).toISOString()
  let cursor = ''
  let count = 0
  let pages = 0
  let latest = updatedFrom

  do {
    const body = await fetchManagementPage(endpoint, {
      limit: 500,
      updatedFrom: updatedFrom || undefined,
      cursor: cursor || undefined,
    })
    const rows = body.data || []
    if (rows.length) {
      count += await upsertRecords(endpoint, rows)
      latest = maxUpdatedAt(latest, rows)
    }
    pages += 1
    cursor = body.page?.hasMore ? String(body.page?.nextCursor || '') : ''
    if (body.page?.hasMore && !cursor) throw new Error(`${endpoint}: nextCursor missing`)
  } while (cursor)

  await saveSyncSuccess(endpoint, latest, count)
  return { endpoint, mode: updatedFrom ? 'incremental' : 'full', rows: count, pages, lastUpdatedAt: latest || null }
}

module.exports = async function managementSync(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'method not allowed' })
  if (!(await isAuthorized(req, res))) return sendJson(res, 403, { success: false, error: 'forbidden' })

  const lockToken = await trySyncLock().catch(() => '')
  if (!lockToken) return sendJson(res, 409, { success: false, error: 'sync already running' })

  const requested = String(req.query?.endpoint || '')
  const endpoints = requested ? ENDPOINTS.filter(endpoint => endpoint === requested) : ENDPOINTS
  const forceFull = String(req.query?.full || '') === '1'
  if (!endpoints.length) {
    await releaseSyncLock(lockToken)
    return sendJson(res, 400, { success: false, error: 'invalid endpoint' })
  }

  const results = []
  try {
    for (const endpoint of endpoints) {
      try {
        results.push(await syncEndpoint(endpoint, forceFull))
      } catch (error) {
        await saveSyncError(endpoint, error)
        throw error
      }
    }
    return sendJson(res, 200, { success: true, results, syncedAt: new Date().toISOString() })
  } catch (error) {
    return sendJson(res, 502, { success: false, error: 'management sync failed', message: String(error?.message || error), results })
  } finally {
    await releaseSyncLock(lockToken)
  }
}

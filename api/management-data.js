const { verifyDashboardSession } = require('../server/dashboardAuth')
const { listRecords, listSyncStates } = require('../server/managementStore')

const ALLOWED = new Set(['consultings', 'consulting-utms', 'projects'])

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.end(JSON.stringify(body))
}

module.exports = async function managementData(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { success: false, error: 'method not allowed' })
  if (!(await verifyDashboardSession(req))) return sendJson(res, 401, { success: false, error: 'unauthorized' })

  try {
    const type = String(req.query?.type || '')
    if (type === 'sync-status') {
      const states = await listSyncStates()
      return sendJson(res, 200, { success: true, data: states })
    }
    if (!ALLOWED.has(type)) return sendJson(res, 400, { success: false, error: 'invalid type' })
    const result = await listRecords(type, { limit: req.query?.limit, offset: req.query?.offset })
    return sendJson(res, 200, {
      success: true,
      data: result.records,
      page: {
        offset: result.offset,
        limit: result.limit,
        total: result.total,
        hasMore: result.offset + result.records.length < result.total,
      },
    })
  } catch (error) {
    return sendJson(res, 503, { success: false, error: 'management database unavailable', message: String(error?.message || error) })
  }
}

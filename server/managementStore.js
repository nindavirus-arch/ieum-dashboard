const crypto = require('node:crypto')
const postgres = require('postgres')

let client
let schemaReady

function databaseUrl() {
  return String(process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
}

function getDb() {
  const url = databaseUrl()
  if (!url) throw new Error('POSTGRES_URL or DATABASE_URL is not configured')
  if (!client) client = postgres(url, { max: 2, idle_timeout: 20, connect_timeout: 15, prepare: false })
  return client
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getDb()
      await sql`
        CREATE TABLE IF NOT EXISTS management_api_records_prod (
          endpoint text NOT NULL,
          record_key text NOT NULL,
          source_updated_at timestamptz,
          source_registered_at timestamptz,
          payload jsonb NOT NULL,
          synced_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (endpoint, record_key)
        )
      `
      await sql`
        CREATE INDEX IF NOT EXISTS management_api_records_prod_order_idx
        ON management_api_records_prod (endpoint, source_registered_at, source_updated_at, record_key)
      `
      await sql`
        CREATE TABLE IF NOT EXISTS management_sync_state_prod (
          endpoint text PRIMARY KEY,
          last_source_updated_at timestamptz,
          last_success_at timestamptz,
          last_row_count integer NOT NULL DEFAULT 0,
          last_error text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS management_sync_lock_prod (
          lock_name text PRIMARY KEY,
          lock_token text NOT NULL,
          expires_at timestamptz NOT NULL
        )
      `
    })().catch(error => {
      schemaReady = null
      throw error
    })
  }
  await schemaReady
}

function text(value) {
  return String(value ?? '').trim()
}

function hash(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex')
}

function recordKey(endpoint, row) {
  if (endpoint === 'projects' && text(row.projectNumber)) return text(row.projectNumber)
  if ((endpoint === 'consultings' || endpoint === 'consulting-utms') && text(row.consultingNumber)) return text(row.consultingNumber)
  return hash([JSON.stringify(row)])
}

function sourceRegisteredAt(endpoint, row) {
  if (endpoint === 'projects') return row.depositDate || row.updatedAt || null
  return row.registeredAt || row.updatedAt || null
}

async function upsertRecords(endpoint, rows) {
  if (!rows.length) return 0
  await ensureSchema()
  const sql = getDb()
  let total = 0
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500).map(row => ({
      endpoint,
      record_key: recordKey(endpoint, row),
      source_updated_at: row.updatedAt || null,
      source_registered_at: sourceRegisteredAt(endpoint, row),
      payload: sql.json(row),
      synced_at: new Date(),
    }))
    await sql`
      INSERT INTO management_api_records_prod ${sql(batch, 'endpoint', 'record_key', 'source_updated_at', 'source_registered_at', 'payload', 'synced_at')}
      ON CONFLICT (endpoint, record_key) DO UPDATE SET
        source_updated_at = EXCLUDED.source_updated_at,
        source_registered_at = EXCLUDED.source_registered_at,
        payload = EXCLUDED.payload,
        synced_at = EXCLUDED.synced_at
    `
    total += batch.length
  }
  return total
}

async function getSyncState(endpoint) {
  await ensureSchema()
  const rows = await getDb()`SELECT * FROM management_sync_state_prod WHERE endpoint = ${endpoint}`
  return rows[0] || null
}

async function saveSyncSuccess(endpoint, lastUpdatedAt, rowCount) {
  await ensureSchema()
  await getDb()`
    INSERT INTO management_sync_state_prod (endpoint, last_source_updated_at, last_success_at, last_row_count, last_error, updated_at)
    VALUES (${endpoint}, ${lastUpdatedAt || null}, now(), ${rowCount}, null, now())
    ON CONFLICT (endpoint) DO UPDATE SET
      last_source_updated_at = COALESCE(EXCLUDED.last_source_updated_at, management_sync_state_prod.last_source_updated_at),
      last_success_at = EXCLUDED.last_success_at,
      last_row_count = EXCLUDED.last_row_count,
      last_error = null,
      updated_at = now()
  `
}

async function saveSyncError(endpoint, error) {
  await ensureSchema()
  const message = String(error?.message || error).slice(0, 1000)
  await getDb()`
    INSERT INTO management_sync_state_prod (endpoint, last_error, updated_at)
    VALUES (${endpoint}, ${message}, now())
    ON CONFLICT (endpoint) DO UPDATE SET last_error = EXCLUDED.last_error, updated_at = now()
  `
}

async function listRecords(endpoint, options = {}) {
  await ensureSchema()
  const limit = Math.min(2000, Math.max(1, Number(options.limit) || 1000))
  const offset = Math.max(0, Number(options.offset) || 0)
  const countRows = await getDb()`SELECT count(*)::integer AS total FROM management_api_records_prod WHERE endpoint = ${endpoint}`
  const rows = await getDb()`
    SELECT payload
    FROM management_api_records_prod
    WHERE endpoint = ${endpoint}
    ORDER BY source_registered_at ASC NULLS LAST, source_updated_at ASC NULLS LAST, record_key ASC
    LIMIT ${limit} OFFSET ${offset}
  `
  return {
    records: rows.map(row => {
      if (typeof row.payload !== 'string') return row.payload
      try {
        return JSON.parse(row.payload)
      } catch {
        return row.payload
      }
    }),
    total: Number(countRows[0]?.total || 0),
    limit,
    offset,
  }
}

async function listSyncStates() {
  await ensureSchema()
  return getDb()`SELECT * FROM management_sync_state_prod ORDER BY endpoint`
}

async function trySyncLock() {
  await ensureSchema()
  const token = crypto.randomUUID()
  const rows = await getDb()`
    INSERT INTO management_sync_lock_prod (lock_name, lock_token, expires_at)
    VALUES ('management-api', ${token}, now() + interval '4 minutes')
    ON CONFLICT (lock_name) DO UPDATE SET
      lock_token = EXCLUDED.lock_token,
      expires_at = EXCLUDED.expires_at
    WHERE management_sync_lock_prod.expires_at < now()
    RETURNING lock_token
  `
  return rows[0]?.lock_token === token ? token : ''
}

async function releaseSyncLock(token) {
  if (!token) return
  try {
    await getDb()`DELETE FROM management_sync_lock_prod WHERE lock_name = 'management-api' AND lock_token = ${token}`
  } catch {}
}

module.exports = {
  getSyncState,
  listRecords,
  listSyncStates,
  releaseSyncLock,
  saveSyncError,
  saveSyncSuccess,
  trySyncLock,
  upsertRecords,
}

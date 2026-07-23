// Data-access layer over node-postgres.
//
// Two access contexts, both against the SAME database:
//   db.asUser(userId, fn)  — runs fn inside a transaction as the
//        `authenticated` role with request.jwt.claim.sub = userId, so
//        Row-Level Security enforces ownership. Owner endpoints use this.
//   db.service(fn) / db.query(...) — privileged context (bypasses RLS).
//        Public endpoints (which authorize via public_id + verification)
//        and system tasks use this.
import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;

let pool = null;
let embeddedHandle = null;

// Return int8 (bigint) columns like order_number as JS numbers — they
// are well within Number.MAX_SAFE_INTEGER for this app.
pg.types.setTypeParser(20, (v) => (v == null ? null : parseInt(v, 10)));

export async function getPool() {
  if (pool) return pool;
  let connectionString = config.databaseUrl;
  if (!connectionString) {
    const { startEmbedded } = await import('./embedded.js');
    embeddedHandle = await startEmbedded();
    connectionString = embeddedHandle.connectionString;
  }
  pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000 });
  return pool;
}

// One-off query on a pooled connection (service context, RLS bypassed
// when connected as superuser/service_role).
export async function query(text, params) {
  const p = await getPool();
  return p.query(text, params);
}

// Transaction on a dedicated client (service context).
export async function tx(fn) {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

// Run fn as an authenticated owner. RLS is enforced with this identity
// for every statement fn issues on the passed client.
export async function asUser(userId, fn) {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query('set local role authenticated');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

// Convenience alias for the privileged context.
export const service = tx;

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
  if (embeddedHandle) { await embeddedHandle.stop(); embeddedHandle = null; }
}

export default { getPool, query, tx, asUser, service, closePool };

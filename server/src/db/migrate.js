// Migration runner. Applies src/migrations-local/*.sql (local shim,
// only when targeting a local/embedded DB) then src/migrations/*.sql,
// in filename order, each in its own transaction, tracked in
// public.kolkli_send_migrations.
//
//   node src/db/migrate.js up        apply pending
//   node src/db/migrate.js status    list applied / pending
//   node src/db/migrate.js up --with-shim   force-apply the local shim
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import config from '../config.js';
import { getPool, closePool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = resolve(__dirname, '../migrations');
const LOCAL_DIR = resolve(__dirname, '../migrations-local');

function sqlFiles(dir, tag) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter(n => n.endsWith('.sql')).sort()
    .map(n => ({ key: `${tag}${n}`, path: join(dir, n) }));
}

function plan() {
  const includeShim = !config.databaseUrl || process.argv.includes('--with-shim');
  const local = includeShim ? sqlFiles(LOCAL_DIR, 'local/') : [];
  return [...local, ...sqlFiles(MIG_DIR, '')];
}

async function ensureTable(client) {
  await client.query(`create table if not exists public.kolkli_send_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
}

async function appliedSet(client) {
  const { rows } = await client.query('select name from public.kolkli_send_migrations');
  return new Set(rows.map(r => r.name));
}

async function up(client) {
  await ensureTable(client);
  const done = await appliedSet(client);
  const pending = plan().filter(m => !done.has(m.key));
  if (!pending.length) { console.log('migrate: nothing to apply.'); return; }
  for (const m of pending) {
    const sql = readFileSync(m.path, 'utf8');
    process.stdout.write(`migrate: applying ${m.key} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.kolkli_send_migrations(name) values ($1)', [m.key]);
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      throw e;
    }
  }
  console.log(`migrate: applied ${pending.length} migration(s).`);
}

async function status(client) {
  await ensureTable(client);
  const done = await appliedSet(client);
  for (const m of plan()) console.log(`${done.has(m.key) ? '[x]' : '[ ]'} ${m.key}`);
}

const cmd = process.argv[2] || 'up';
let client;
try {
  const pool = await getPool();
  client = await pool.connect();
  if (cmd === 'up') await up(client);
  else if (cmd === 'status') await status(client);
  else { console.error(`unknown command: ${cmd}`); process.exitCode = 2; }
} catch (e) {
  console.error('migrate error:', e && (e.stack || e.message) || e);
  process.exitCode = 1;
} finally {
  if (client) client.release();
  await closePool();
}

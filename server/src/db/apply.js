// Reusable migration applier — used by the test harness (and available
// to scripts) to apply the SQL files to a given pg client in order.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = resolve(__dirname, '../migrations');
const LOCAL_DIR = resolve(__dirname, '../migrations-local');

function files(dir, tag) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter(n => n.endsWith('.sql')).sort().map(n => ({ key: `${tag}${n}`, path: join(dir, n) }));
}

export function migrationFiles({ includeShim = true } = {}) {
  return [...(includeShim ? files(LOCAL_DIR, 'local/') : []), ...files(MIG_DIR, '')];
}

export async function applyMigrations(client, opts = {}) {
  for (const m of migrationFiles(opts)) {
    await client.query(readFileSync(m.path, 'utf8'));
  }
}

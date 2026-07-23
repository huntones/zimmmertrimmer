// Boots a real, native PostgreSQL for local dev / tests — no Docker.
// Used only when DATABASE_URL is empty. embedded-postgres is a
// devDependency, so this module is imported dynamically and never
// pulled into a production install.
//
// The host machine may also run its own PostgreSQL services; this
// instance lives in an isolated data dir on its own free port and
// never touches them.
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));

let singleton = null;

function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
}

export async function startEmbedded(opts = {}) {
  if (singleton && !opts.fresh) return singleton;
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const databaseDir = resolve(opts.dir || process.env.EMBEDDED_PG_DIR ||
    resolve(__dirname, '../../.pgdata'));
  const envPort = parseInt(process.env.EMBEDDED_PG_PORT || '', 10);
  const port = opts.port || (Number.isFinite(envPort) ? envPort : await freePort());
  const user = 'postgres', password = 'postgres';

  const pg = new EmbeddedPostgres({
    databaseDir, user, password, port,
    persistent: opts.persistent !== false,
    // Force UTF-8 so filenames / messages in any language store cleanly.
    // (The host's Hebrew locale would otherwise create a WIN1255 cluster.)
    initdbFlags: ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C'],
    onLog: () => {},          // keep the migrate/test output readable
    onError: () => {},
  });

  const alreadyInit = existsSync(databaseDir) && readdirSync(databaseDir).length > 0;
  if (!alreadyInit) await pg.initialise();
  await pg.start();

  const connectionString = `postgres://${user}:${password}@localhost:${port}/postgres`;
  const handle = {
    connectionString,
    stop: async () => { try { await pg.stop(); } catch { /* already down */ } if (singleton === handle) singleton = null; },
  };
  if (opts.fresh) return handle;
  singleton = handle;
  return handle;
}

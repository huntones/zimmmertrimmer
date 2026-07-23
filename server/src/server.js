// Entry point. Boots the HTTP server, the rate-limit sweeper, and the
// expiry scheduler. With no DATABASE_URL an embedded Postgres is started
// automatically (dev convenience).
import config from './config.js';
import { createApp } from './app.js';
import { getPool } from './db/index.js';
import { startScheduler } from './scheduler.js';
import { startRateLimitSweeper } from './lib/ratelimit.js';

async function main() {
  await getPool();                 // establish (or boot) the DB up front
  startRateLimitSweeper();
  startScheduler();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`KOLKLI SEND backend listening on :${config.port}`);
    console.log(`  storage=${config.storage.driver} mail=${config.mail.driver} db=${config.databaseUrl ? 'external' : 'embedded'}`);
  });
}

main().catch(e => { console.error('failed to start:', e); process.exit(1); });

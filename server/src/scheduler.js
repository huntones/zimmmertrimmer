// Scheduled expiry sweep. Flips any past-expiry delivery that is still
// live (sent/opened/downloaded) to `expired` and writes an audit event,
// so expiry is enforced even for deliveries nobody has opened recently.
// The per-request lazy_expire() covers active traffic; this covers the rest.
import { query } from './db/index.js';
import config from './config.js';

export async function sweepExpired() {
  const { rows } = await query(
    `update kolkli_send.deliveries
        set status='expired'
      where expires_at is not null and expires_at <= now()
        and status in ('sent','opened','downloaded')
      returning id`);
  for (const r of rows) {
    await query(
      `insert into kolkli_send.delivery_events (delivery_id, event_type, metadata)
       values ($1,'delivery_expired', jsonb_build_object('by','scheduler'))`, [r.id]);
  }
  return rows.length;
}

let timer = null;
export function startScheduler() {
  if (timer || !config.expirySweepSec) return;
  timer = setInterval(() => {
    sweepExpired().catch(e => console.error('expiry sweep failed:', e.message));
  }, config.expirySweepSec * 1000);
  timer.unref?.();
}

export function stopScheduler() { if (timer) { clearInterval(timer); timer = null; } }

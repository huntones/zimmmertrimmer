// Public (client) API — under /api/public/deliveries/:publicId.
//
// No account. Authorization comes from (a) knowing the unguessable
// public_id, (b) passing password / email-code verification where the
// delivery requires it, and (c) the access-gate checklist enforced on
// every files/download request. Responses never expose user_id, storage
// keys, password hashes, other recipients, IPs, or the audit log.
import { Router } from 'express';
import { query, service } from '../db/index.js';
import { getStorage } from '../storage/index.js';
import { mintClientSession, verifyClientSession, bearer } from '../auth/jwt.js';
import { clientIp, userAgent } from '../http/util.js';
import { streamZip } from '../http/zip.js';
import { sixDigitCode } from '../lib/ids.js';
import { rateLimit, POLICY } from '../lib/ratelimit.js';
import { wrap, badRequest, notFound, forbidden, gone, unauthorized, tooMany } from '../lib/errors.js';
import config from '../config.js';

const router = Router();

// ---- rate-limit guard ------------------------------------------------
function limit(name, req, ...extra) {
  const key = [name, clientIp(req), req.params.publicId, ...extra].join('|');
  const r = rateLimit(key, POLICY[name]);
  if (!r.allowed) throw tooMany('rate_limited', 'too many requests', r.retryAfter);
}

// ---- load + gate -----------------------------------------------------
const ACCESSIBLE = new Set(['sent', 'opened', 'downloaded']);

// Load the internal delivery row (service context). Never returned raw.
async function loadRow(publicId) {
  const { rows } = await query(
    `select id,user_id,public_id,title,status,security_type,
            allow_preview,allow_download,allow_download_all,allow_comments,
            expires_at,max_views,max_downloads,view_count,download_count
       from kolkli_send.deliveries where public_id=$1`, [publicId]);
  return rows[0] || null;
}

// Ensure the delivery is reachable by a public client right now.
// Applies lazy-expire, then maps lifecycle state to the right HTTP error.
async function requireAccessible(publicId) {
  let d = await loadRow(publicId);
  if (!d) throw notFound('delivery_not_found');
  await query('select kolkli_send.lazy_expire($1)', [d.id]);
  d = await loadRow(publicId);
  switch (d.status) {
    case 'sent': case 'opened': case 'downloaded': return d;
    case 'draft':   throw notFound('delivery_not_found');   // not sent yet -> hidden
    case 'revoked': throw gone('revoked', 'this delivery was revoked');
    case 'expired': throw gone('expired', 'this delivery has expired');
    case 'blocked': throw forbidden('blocked', 'this delivery is blocked');
    default:        throw notFound('delivery_not_found');
  }
}

function clientToken(req) {
  return bearer(req) || (req.body && req.body.session) || req.query.st || null;
}

// Is the client verified for this delivery? Link-only never needs it.
async function verifiedSession(d, req) {
  if (d.security_type === 'link') return { ok: true, session: null };
  const s = await verifyClientSession(clientToken(req), d.public_id);
  return { ok: !!s, session: s };
}

async function recordEvent(deliveryId, type, req, { recipientId = null, fileId = null, meta = {} } = {}) {
  await query('select kolkli_send.record_event($1,$2,$3,$4,$5,$6,$7)',
    [deliveryId, recipientId, fileId, type, clientIp(req), userAgent(req), meta]);
}

// Resolve one file (delivery_files id) with its effective permissions.
async function loadFile(deliveryId, fileId) {
  const { rows } = await query(
    `select df.id, df.folder_id, df.display_name,
            coalesce(df.allow_preview, d.allow_preview)  as allow_preview,
            coalesce(df.allow_download, d.allow_download) as allow_download,
            sf.storage_key, sf.original_name, sf.mime_type
       from kolkli_send.delivery_files df
       join kolkli_send.stored_files sf on sf.id = df.file_id
       join kolkli_send.deliveries    d  on d.id = df.delivery_id
      where df.id=$1 and df.delivery_id=$2`, [fileId, deliveryId]);
  return rows[0] || null;
}

// ======================================================================
// GET delivery (curated). Includes the file listing only for link-only
// deliveries or an already-verified client.
// ======================================================================
router.get('/:publicId', wrap(async (req, res) => {
  limit('public_open', req);
  const d = await requireAccessible(req.params.publicId);
  const { ok: verified, session } = await verifiedSession(d, req);
  const includeFiles = verified;

  const { rows } = await query('select kolkli_send.public_view($1,$2) v', [d.public_id, includeFiles]);
  const view = rows[0].v;

  if (includeFiles) {
    await query('select kolkli_send.mark_opened($1,$2)', [d.id, session?.rid || null]);
    await recordEvent(d.id, 'delivery_opened', req, { recipientId: session?.rid || null });
  }
  res.json({
    delivery: view,
    verified,
    requires_password: d.security_type === 'password' && !verified,
    requires_code: d.security_type === 'email_code' && !verified,
  });
}));

// ======================================================================
// Verify password -> client session token
// ======================================================================
router.post('/:publicId/verify-password', wrap(async (req, res) => {
  limit('password_attempt', req);
  const d = await requireAccessible(req.params.publicId);
  if (d.security_type !== 'password') throw badRequest('password_not_required');
  const pw = (req.body || {}).password;
  if (!pw) throw badRequest('password_required');

  const ok = (await query('select kolkli_send.verify_password($1,$2) ok', [d.public_id, pw])).rows[0].ok;
  if (!ok) {
    await recordEvent(d.id, 'password_failed', req);
    throw unauthorized('invalid_password', 'incorrect password');
  }
  const token = await mintClientSession({ publicId: d.public_id, recipientId: null });
  res.json({ token, expires_in: config.publicSessionTtlMin * 60 });
}));

// ======================================================================
// Send email code. Never reveals whether the email is a known recipient.
// ======================================================================
router.post('/:publicId/send-code', wrap(async (req, res) => {
  limit('send_code', req, (req.body || {}).email || '');
  const d = await requireAccessible(req.params.publicId);
  if (d.security_type !== 'email_code') throw badRequest('code_not_required');
  const email = ((req.body || {}).email || '').toLowerCase().trim();
  if (!email) throw badRequest('email_required');

  // Look up quietly; respond identically whether or not it matches.
  const r = (await query(
    'select id from kolkli_send.delivery_recipients where delivery_id=$1 and lower(email)=$2',
    [d.id, email])).rows[0];
  if (r) {
    const code = sixDigitCode();
    await query('select kolkli_send.store_code($1,$2,$3,$4)', [d.id, r.id, code, config.verify.codeTtlMin]);
    await recordEvent(d.id, 'verification_sent', req, { recipientId: r.id });
    const { verificationCode } = await import('../mail/notifications.js');
    verificationCode({ to: email, code, title: d.title }).catch(() => {});
  }
  res.json({ sent: true }); // identical response regardless of existence
}));

// ======================================================================
// Verify email code -> client session token
// ======================================================================
router.post('/:publicId/verify-code', wrap(async (req, res) => {
  limit('verify_code', req, (req.body || {}).email || '');
  const d = await requireAccessible(req.params.publicId);
  if (d.security_type !== 'email_code') throw badRequest('code_not_required');
  const b = req.body || {};
  const email = (b.email || '').toLowerCase().trim();
  const code = String(b.code || '').trim();
  if (!email || !code) throw badRequest('email_and_code_required');

  const r = (await query(
    'select id from kolkli_send.delivery_recipients where delivery_id=$1 and lower(email)=$2',
    [d.id, email])).rows[0];
  const status = r
    ? (await query('select kolkli_send.check_code($1,$2,$3,$4) s', [d.id, r.id, code, config.verify.maxAttempts])).rows[0].s
    : 'none';

  if (status === 'ok') {
    const token = await mintClientSession({ publicId: d.public_id, recipientId: r.id });
    await recordEvent(d.id, 'recipient_verified', req, { recipientId: r.id });
    return res.json({ token, expires_in: config.publicSessionTtlMin * 60 });
  }
  await recordEvent(d.id, 'verification_failed', req, { recipientId: r ? r.id : null, meta: { status } });
  if (status === 'locked') throw tooMany('locked', 'too many attempts; try again later');
  throw unauthorized('verification_failed', 'invalid or expired code');
}));

// ======================================================================
// Preview one file -> short-lived inline URL
// ======================================================================
router.get('/:publicId/files/:fileId/preview', wrap(async (req, res) => {
  limit('presign', req);
  const d = await requireAccessible(req.params.publicId);
  const { ok: verified, session } = await verifiedSession(d, req);
  if (!verified) throw unauthorized('verification_required');
  if (!d.allow_preview) throw forbidden('preview_disabled');
  if (d.max_views != null && d.view_count >= d.max_views) throw forbidden('view_limit_reached');

  const f = await loadFile(d.id, req.params.fileId);
  if (!f) throw notFound('file_not_found');
  if (!f.allow_preview) throw forbidden('preview_disabled');

  const storage = await getStorage();
  const url = await storage.presignDownload({
    key: f.storage_key, filename: f.display_name || f.original_name,
    ttlSec: config.presignTtlSec, inline: true,
  });
  await recordEvent(d.id, 'file_previewed', req, { recipientId: session?.rid || null, fileId: f.id });
  res.json({ url, expires_in: config.presignTtlSec });
}));

// ======================================================================
// Download one file -> short-lived attachment URL (gate checklist)
// ======================================================================
router.post('/:publicId/files/:fileId/download', wrap(async (req, res) => {
  limit('presign', req);
  const d = await requireAccessible(req.params.publicId);              // exists + sent + not revoked/expired
  const { ok: verified, session } = await verifiedSession(d, req);     // verified if required
  if (!verified) throw unauthorized('verification_required');
  if (!d.allow_download) throw forbidden('download_disabled');         // download allowed?
  if (d.max_downloads != null && d.download_count >= d.max_downloads)  // download limit
    throw forbidden('download_limit_reached');

  const f = await loadFile(d.id, req.params.fileId);
  if (!f) throw notFound('file_not_found');
  if (!f.allow_download) throw forbidden('download_disabled');

  const storage = await getStorage();
  const url = await storage.presignDownload({                          // presign only now
    key: f.storage_key, filename: f.display_name || f.original_name, ttlSec: config.presignTtlSec,
  });
  await query('select kolkli_send.mark_downloaded($1,$2,$3)', [d.id, session?.rid || null, 1]);
  await recordEvent(d.id, 'file_downloaded', req, { recipientId: session?.rid || null, fileId: f.id });
  notifyOwnerDownloaded(d, f, session).catch(() => {});
  res.json({ url, expires_in: config.presignTtlSec });
}));

// ======================================================================
// Download ALL -> streaming ZIP (gate checklist re-applied)
// ======================================================================
router.post('/:publicId/download-all', wrap(async (req, res) => {
  limit('download_all', req);
  const d = await requireAccessible(req.params.publicId);
  const { ok: verified, session } = await verifiedSession(d, req);
  if (!verified) throw unauthorized('verification_required');
  if (!d.allow_download || !d.allow_download_all) throw forbidden('download_all_disabled');
  if (d.max_downloads != null && d.download_count >= d.max_downloads) throw forbidden('download_limit_reached');

  // Gather downloadable files with folder paths (service context).
  const files = (await query(
    `with recursive tree as (
        select id, parent_folder_id, name, name::text as path
          from kolkli_send.delivery_folders where delivery_id=$1 and parent_folder_id is null
        union all
        select f.id, f.parent_folder_id, f.name, (t.path || '/' || f.name)
          from kolkli_send.delivery_folders f join tree t on f.parent_folder_id = t.id)
     select df.id, sf.storage_key,
            coalesce(df.display_name, sf.original_name) as name,
            coalesce(t.path, '') as path
       from kolkli_send.delivery_files df
       join kolkli_send.stored_files sf on sf.id = df.file_id
       join kolkli_send.deliveries    dd on dd.id = df.delivery_id
       left join tree t on t.id = df.folder_id
      where df.delivery_id=$1
        and coalesce(df.allow_download, dd.allow_download) = true
      order by path, df.sort_order`, [d.id])).rows;

  if (!files.length) throw notFound('no_downloadable_files');

  await query('select kolkli_send.mark_downloaded($1,$2,$3)', [d.id, session?.rid || null, 1]);
  await recordEvent(d.id, 'download_all_requested', req, { recipientId: session?.rid || null, meta: { files: files.length } });

  const storage = await getStorage();
  const zipName = (d.title ? d.title.replace(/[^\w.\- ]+/g, '_').trim() : 'Delivery') + '_KOLKLI';
  await streamZip({
    res, storage, zipName,
    files: files.map(f => ({ storageKey: f.storage_key, name: f.name, path: f.path })),
  });
}));

// Best-effort owner notification on download (owner email from auth.users).
async function notifyOwnerDownloaded(d, f, session) {
  const owner = (await query('select email from auth.users where id=$1', [d.user_id])).rows[0];
  if (!owner || !owner.email) return;
  const { downloadedAlert, allDownloadedAlert } = await import('../mail/notifications.js');
  await downloadedAlert({ to: owner.email, title: d.title, fileName: f.display_name || f.original_name });
  const counts = (await query(
    `select (select count(*) from kolkli_send.delivery_files where delivery_id=$1) total,
            (select download_count from kolkli_send.deliveries where id=$1) dl`, [d.id])).rows[0];
  if (Number(counts.dl) >= Number(counts.total) && Number(counts.total) > 0) {
    await allDownloadedAlert({ to: owner.email, title: d.title });
  }
}

export default router;

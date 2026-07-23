// Owner API — everything under /api/deliveries. Every handler runs inside
// an asUser() transaction so Row-Level Security enforces that the caller
// can only see and touch their own deliveries.
import { Router } from 'express';
import { asUser } from '../db/index.js';
import { getStorage } from '../storage/index.js';
import { verifyOwnerToken, bearer } from '../auth/jwt.js';
import { receiveUpload } from '../http/upload.js';
import { clientIp, userAgent } from '../http/util.js';
import { wrap, badRequest, notFound, conflict } from '../lib/errors.js';
import { ownerDelivery, ownerRecipient, ownerFolder, ownerFile, ownerEvent } from '../lib/serialize.js';

const router = Router();

// --- auth middleware --------------------------------------------------
router.use(wrap(async (req, _res, next) => {
  const payload = await verifyOwnerToken(bearer(req));
  req.owner = { id: payload.sub, email: payload.email || null };
  next();
}));

// --- helpers ----------------------------------------------------------
const SECURITY = new Set(['link', 'password', 'email_code']);
const bool = (v, d) => (v === undefined ? d : !!v);

async function loadDelivery(client, id) {
  const { rows } = await client.query('select * from kolkli_send.deliveries where id = $1', [id]);
  if (!rows[0]) throw notFound('delivery_not_found');
  return rows[0];
}

async function event(client, deliveryId, type, req, { recipientId = null, fileId = null, meta = {} } = {}) {
  await client.query(
    'select kolkli_send.record_event($1,$2,$3,$4,$5,$6,$7)',
    [deliveryId, recipientId, fileId, type, clientIp(req), userAgent(req), meta]);
}

function parseExpiry(v) {
  if (v === undefined || v === null || v === '') return null;
  const t = new Date(v);
  if (isNaN(t.getTime())) throw badRequest('bad_expiry', 'expires_at must be an ISO date');
  return t.toISOString();
}

// ======================================================================
// Create
// ======================================================================
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const security = b.security_type && SECURITY.has(b.security_type) ? b.security_type : 'link';
  if (security === 'password' && !b.password) throw badRequest('password_required', 'password security needs a password');

  const out = await asUser(req.owner.id, async (client) => {
    const { rows } = await client.query(
      `insert into kolkli_send.deliveries
         (user_id, project_id, title, message, security_type, password_hash,
          allow_preview, allow_download, allow_download_all, allow_comments,
          expires_at, max_views, max_downloads)
       values ($1,$2,$3,$4,$5,
          case when $6::text is not null then kolkli_send.hash_secret($6) else null end,
          $7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [req.owner.id, b.project_id || null, b.title || null, b.message || null, security,
       b.password || null,
       bool(b.allow_preview, true), bool(b.allow_download, true),
       bool(b.allow_download_all, true), bool(b.allow_comments, false),
       parseExpiry(b.expires_at), b.max_views ?? null, b.max_downloads ?? null]);
    await event(client, rows[0].id, 'delivery_created', req);
    return rows[0];
  });
  res.status(201).json({ delivery: ownerDelivery(out) });
}));

// ======================================================================
// List
// ======================================================================
router.get('/', wrap(async (req, res) => {
  const rows = await asUser(req.owner.id, async (client) =>
    (await client.query('select * from kolkli_send.deliveries order by created_at desc')).rows);
  res.json({ deliveries: rows.map(ownerDelivery) });
}));

// ======================================================================
// Get one (with recipients, folders, files)
// ======================================================================
router.get('/:id', wrap(async (req, res) => {
  const data = await asUser(req.owner.id, async (client) => {
    const d = await loadDelivery(client, req.params.id);
    const recipients = (await client.query(
      'select * from kolkli_send.delivery_recipients where delivery_id=$1 order by created_at', [d.id])).rows;
    const folders = (await client.query(
      'select * from kolkli_send.delivery_folders where delivery_id=$1 order by sort_order,name', [d.id])).rows;
    const files = (await client.query(
      `select df.*, sf.original_name, sf.size_bytes, sf.mime_type, sf.status
         from kolkli_send.delivery_files df
         join kolkli_send.stored_files sf on sf.id = df.file_id
        where df.delivery_id=$1 order by df.sort_order`, [d.id])).rows;
    return { d, recipients, folders, files };
  });
  res.json({
    delivery: ownerDelivery(data.d),
    recipients: data.recipients.map(ownerRecipient),
    folders: data.folders.map(ownerFolder),
    files: data.files.map(ownerFile),
  });
}));

// ======================================================================
// Update
// ======================================================================
router.patch('/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const out = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const sets = [], vals = []; let i = 1;
    const set = (col, val) => { sets.push(`${col}=$${i++}`); vals.push(val); };

    for (const col of ['title', 'message', 'project_id']) if (col in b) set(col, b[col]);
    for (const col of ['allow_preview', 'allow_download', 'allow_download_all', 'allow_comments'])
      if (col in b) set(col, !!b[col]);
    if ('expires_at' in b) set('expires_at', parseExpiry(b.expires_at));
    if ('max_views' in b) set('max_views', b.max_views ?? null);
    if ('max_downloads' in b) set('max_downloads', b.max_downloads ?? null);
    if ('security_type' in b) {
      if (!SECURITY.has(b.security_type)) throw badRequest('bad_security_type');
      set('security_type', b.security_type);
    }
    if ('password' in b) {
      if (b.password === null || b.password === '') { sets.push('password_hash=null'); }
      else { sets.push(`password_hash=kolkli_send.hash_secret($${i++})`); vals.push(b.password); }
    }
    if (!sets.length) return loadDelivery(client, req.params.id);

    vals.push(req.params.id);
    const { rows } = await client.query(
      `update kolkli_send.deliveries set ${sets.join(', ')} where id=$${i} returning *`, vals);
    await event(client, req.params.id, 'delivery_updated', req);
    return rows[0];
  });
  res.json({ delivery: ownerDelivery(out) });
}));

// ======================================================================
// Delete (removes storage objects orphaned by the delete)
// ======================================================================
router.delete('/:id', wrap(async (req, res) => {
  const orphanKeys = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    // storage keys referenced ONLY by this delivery
    const { rows } = await client.query(
      `select sf.id, sf.storage_key
         from kolkli_send.stored_files sf
         join kolkli_send.delivery_files df on df.file_id = sf.id
        where df.delivery_id = $1
          and not exists (select 1 from kolkli_send.delivery_files df2
                          where df2.file_id = sf.id and df2.delivery_id <> $1)`,
      [req.params.id]);
    await client.query('delete from kolkli_send.deliveries where id=$1', [req.params.id]);
    if (rows.length) {
      await client.query('delete from kolkli_send.stored_files where id = any($1::uuid[])',
        [rows.map(r => r.id)]);
    }
    return rows.map(r => r.storage_key);
  });
  const storage = await getStorage();
  for (const k of orphanKeys) await storage.delete(k).catch(() => {});
  res.status(204).end();
}));

// ======================================================================
// Lifecycle: send / revoke / reactivate
// ======================================================================
router.post('/:id/send', wrap(async (req, res) => {
  const result = await asUser(req.owner.id, async (client) => {
    const d = await loadDelivery(client, req.params.id);
    if (!['draft', 'ready'].includes(d.status))
      throw conflict('not_sendable', `cannot send a ${d.status} delivery`);
    const fileCount = Number((await client.query(
      'select count(*)::int n from kolkli_send.delivery_files where delivery_id=$1', [d.id])).rows[0].n);
    if (!fileCount) throw badRequest('no_files', 'add at least one file before sending');
    const recips = (await client.query(
      'select * from kolkli_send.delivery_recipients where delivery_id=$1 and email is not null', [d.id])).rows;
    if (d.security_type === 'email_code' && !recips.length)
      throw badRequest('no_recipients', 'email-code security needs at least one recipient with an email');

    if (d.status === 'draft') await client.query(
      "update kolkli_send.deliveries set status='ready' where id=$1", [d.id]);
    const { rows } = await client.query(
      "update kolkli_send.deliveries set status='sent', sent_at=coalesce(sent_at, now()) where id=$1 returning *",
      [d.id]);
    await event(client, d.id, 'delivery_sent', req, { meta: { files: fileCount, recipients: recips.length } });
    return { delivery: rows[0], recipients: recips };
  });

  // Notify recipients (best-effort, after commit).
  const { newDelivery } = await import('../mail/notifications.js');
  for (const r of result.recipients) {
    newDelivery({ to: r.email, publicId: result.delivery.public_id,
      title: result.delivery.title, message: result.delivery.message,
      senderName: req.owner.email }).catch(() => {});
  }
  res.json({ delivery: ownerDelivery(result.delivery) });
}));

router.post('/:id/revoke', wrap(async (req, res) => {
  const out = await asUser(req.owner.id, async (client) => {
    const d = await loadDelivery(client, req.params.id);
    if (d.status === 'expired') throw conflict('cannot_revoke_expired', 'reactivate first');
    const { rows } = await client.query(
      "update kolkli_send.deliveries set status='revoked', revoked_at=now() where id=$1 returning *", [d.id]);
    await event(client, d.id, 'delivery_revoked', req);
    return rows[0];
  });
  res.json({ delivery: ownerDelivery(out) });
}));

router.post('/:id/reactivate', wrap(async (req, res) => {
  const b = req.body || {};
  const out = await asUser(req.owner.id, async (client) => {
    const d = await loadDelivery(client, req.params.id);
    if (!['revoked', 'expired'].includes(d.status))
      throw conflict('not_reactivatable', `status is ${d.status}`);
    const target = d.sent_at ? 'sent' : 'ready';
    // Choose a fresh expiry: explicit > (if still-past/absent, clear it).
    let newExpiry = d.expires_at;
    if ('expires_at' in b) newExpiry = parseExpiry(b.expires_at);
    else if (d.expires_at && new Date(d.expires_at) <= new Date()) newExpiry = null;
    const { rows } = await client.query(
      `update kolkli_send.deliveries set status=$2, revoked_at=null, expires_at=$3 where id=$1 returning *`,
      [d.id, target, newExpiry]);
    await event(client, d.id, 'delivery_reactivated', req, { meta: { to: target } });
    return rows[0];
  });
  res.json({ delivery: ownerDelivery(out) });
}));

// ======================================================================
// Recipients
// ======================================================================
router.post('/:id/recipients', wrap(async (req, res) => {
  const b = req.body || {};
  const list = Array.isArray(b.recipients) ? b.recipients : [b];
  const clean = list.filter(r => r && (r.email || r.name || r.phone))
    .map(r => ({ name: r.name || null, email: r.email ? String(r.email).toLowerCase() : null, phone: r.phone || null }));
  if (!clean.length) throw badRequest('no_recipients', 'provide name/email/phone');

  const out = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const added = [];
    for (const r of clean) {
      try {
        const { rows } = await client.query(
          `insert into kolkli_send.delivery_recipients (delivery_id,name,email,phone)
           values ($1,$2,$3,$4) returning *`, [req.params.id, r.name, r.email, r.phone]);
        added.push(rows[0]);
        await event(client, req.params.id, 'recipient_added', req, { recipientId: rows[0].id });
      } catch (e) {
        if (e.code === '23505') continue; // duplicate email on this delivery — skip
        throw e;
      }
    }
    return added;
  });
  res.status(201).json({ recipients: out.map(ownerRecipient) });
}));

router.delete('/:id/recipients/:recipientId', wrap(async (req, res) => {
  await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const { rowCount } = await client.query(
      'delete from kolkli_send.delivery_recipients where id=$1 and delivery_id=$2',
      [req.params.recipientId, req.params.id]);
    if (!rowCount) throw notFound('recipient_not_found');
  });
  res.status(204).end();
}));

// ======================================================================
// Files: upload+associate, or associate an existing stored file
// ======================================================================
router.post('/:id/files', wrap(async (req, res) => {
  const storage = await getStorage();
  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/');

  if (isMultipart) {
    // 1) stream the upload to storage (outside the DB tx)
    const up = await receiveUpload(req, storage, req.owner.id);
    // 2) dedup + associate inside a tx
    const result = await asUser(req.owner.id, async (client) => {
      await loadDelivery(client, req.params.id);
      const dup = await client.query(
        'select * from kolkli_send.stored_files where owner=auth.uid() and sha256=$1 limit 1', [up.sha256]);
      let stored;
      if (dup.rows[0]) { stored = dup.rows[0]; }        // reuse — don't duplicate bytes
      else {
        stored = (await client.query(
          `insert into kolkli_send.stored_files (owner, storage_key, original_name, mime_type, size_bytes, sha256, status)
           values (auth.uid(),$1,$2,$3,$4,$5,'stored') returning *`,
          [up.key, up.safeName, up.mime, up.size, up.sha256])).rows[0];
      }
      const assoc = await associate(client, req.params.id, stored, up.fields, req);
      return { assoc, dedup: !!dup.rows[0] };
    }).catch(async (e) => { await storage.delete(up.key).catch(() => {}); throw e; });

    // If we reused an existing stored_file, the freshly uploaded object is redundant.
    if (result.dedup) await storage.delete(up.key).catch(() => {});
    return res.status(201).json({ file: ownerFile(result.assoc), deduplicated: result.dedup });
  }

  // JSON path: associate an already-stored file the owner owns.
  const b = req.body || {};
  if (!b.file_id) throw badRequest('file_id_required', 'send multipart upload or a file_id');
  const assoc = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const sf = (await client.query(
      'select * from kolkli_send.stored_files where id=$1', [b.file_id])).rows[0];
    if (!sf) throw notFound('file_not_found');       // RLS hides other owners' files
    return associate(client, req.params.id, sf, b, req);
  });
  res.status(201).json({ file: ownerFile(assoc) });
}));

async function associate(client, deliveryId, storedFile, fields, req) {
  let row;
  try {
    row = (await client.query(
      `insert into kolkli_send.delivery_files (delivery_id, file_id, folder_id, display_name, sort_order)
       values ($1,$2,$3,$4,coalesce($5,0)) returning *`,
      [deliveryId, storedFile.id, fields.folder_id || null,
       fields.display_name || storedFile.original_name || null,
       fields.sort_order != null ? Number(fields.sort_order) : null])).rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('already_attached', 'file already in this delivery');
    throw e;
  }
  await event(client, deliveryId, 'file_added', req, { fileId: row.id });
  return {
    ...row, original_name: storedFile.original_name, size_bytes: storedFile.size_bytes,
    mime_type: storedFile.mime_type, status: storedFile.status,
  };
}

router.delete('/:id/files/:fileId', wrap(async (req, res) => {
  const orphanKey = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const df = (await client.query(
      'select * from kolkli_send.delivery_files where id=$1 and delivery_id=$2',
      [req.params.fileId, req.params.id])).rows[0];
    if (!df) throw notFound('file_not_found');
    await client.query('delete from kolkli_send.delivery_files where id=$1', [df.id]);
    const still = await client.query(
      'select 1 from kolkli_send.delivery_files where file_id=$1 limit 1', [df.file_id]);
    if (still.rowCount) return null;
    const sf = (await client.query(
      'select storage_key from kolkli_send.stored_files where id=$1', [df.file_id])).rows[0];
    await client.query('delete from kolkli_send.stored_files where id=$1', [df.file_id]);
    return sf ? sf.storage_key : null;
  });
  if (orphanKey) { const storage = await getStorage(); await storage.delete(orphanKey).catch(() => {}); }
  res.status(204).end();
}));

// ======================================================================
// Folders
// ======================================================================
router.post('/:id/folders', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw badRequest('name_required');
  const out = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const { rows } = await client.query(
      `insert into kolkli_send.delivery_folders (delivery_id, parent_folder_id, name, sort_order)
       values ($1,$2,$3,coalesce($4,0)) returning *`,
      [req.params.id, b.parent_folder_id || null, b.name, b.sort_order != null ? Number(b.sort_order) : null]);
    await event(client, req.params.id, 'folder_created', req);
    return rows[0];
  });
  res.status(201).json({ folder: ownerFolder(out) });
}));

router.patch('/:id/folders/:folderId', wrap(async (req, res) => {
  const b = req.body || {};
  const out = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const sets = [], vals = []; let i = 1;
    if ('name' in b) { sets.push(`name=$${i++}`); vals.push(b.name); }
    if ('parent_folder_id' in b) { sets.push(`parent_folder_id=$${i++}`); vals.push(b.parent_folder_id || null); }
    if ('sort_order' in b) { sets.push(`sort_order=$${i++}`); vals.push(Number(b.sort_order) || 0); }
    if (!sets.length) throw badRequest('nothing_to_update');
    vals.push(req.params.folderId, req.params.id);
    const { rows } = await client.query(
      `update kolkli_send.delivery_folders set ${sets.join(', ')}
        where id=$${i++} and delivery_id=$${i} returning *`, vals);
    if (!rows[0]) throw notFound('folder_not_found');
    return rows[0];
  });
  res.json({ folder: ownerFolder(out) });
}));

router.delete('/:id/folders/:folderId', wrap(async (req, res) => {
  await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    const { rowCount } = await client.query(
      'delete from kolkli_send.delivery_folders where id=$1 and delivery_id=$2',
      [req.params.folderId, req.params.id]);
    if (!rowCount) throw notFound('folder_not_found');
  });
  res.status(204).end();
}));

// ======================================================================
// Audit log
// ======================================================================
router.get('/:id/events', wrap(async (req, res) => {
  const rows = await asUser(req.owner.id, async (client) => {
    await loadDelivery(client, req.params.id);
    return (await client.query(
      'select * from kolkli_send.delivery_events where delivery_id=$1 order by created_at desc limit 500',
      [req.params.id])).rows;
  });
  res.json({ events: rows.map(ownerEvent) });
}));

export default router;

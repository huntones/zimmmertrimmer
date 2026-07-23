// Serves objects for the LOCAL storage driver's presigned URLs. The
// storage directory is never exposed statically; the ONLY way in is a
// valid, unexpired HMAC signature (verifyPresigned). With STORAGE_DRIVER=r2
// this route is unused — those presigned URLs point straight at R2.
import { Router } from 'express';
import config from '../config.js';
import { localStorage } from '../storage/local-fs.js';
import { verifyPresigned } from '../lib/presign.js';

const router = Router();

router.get('/', async (req, res) => {
  if (config.storage.driver !== 'local') return res.status(404).end();
  const v = verifyPresigned(req.query);
  if (!v) return res.status(403).json({ error: 'invalid_or_expired_url' });

  const head = await localStorage.head(v.key);
  if (!head) return res.status(404).json({ error: 'not_found' });

  const inline = req.query.disp === 'inline';
  res.setHeader('Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${v.filename.replace(/"/g, '')}"`);
  res.setHeader('Content-Length', String(head.size));
  res.setHeader('Cache-Control', 'private, no-store');

  const stream = localStorage.getStream(v.key);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
  stream.pipe(res);
});

export default router;

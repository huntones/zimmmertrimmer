// Express app assembly. Exported without listening so tests can drive it
// in-process; server.js adds .listen() + the scheduler.
import express from 'express';
import config from './config.js';
import ownerRouter from './api/owner.js';
import publicRouter from './api/public.js';
import blobRouter from './api/blob.js';
import { sendError } from './http/util.js';

function cors(req, res, next) {
  const origin = req.headers.origin;
  const allow = config.allowedOrigin;
  if (allow === '*') res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allow.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors);

  // JSON parsing for everything EXCEPT multipart uploads (which stream).
  app.use((req, res, next) => {
    if ((req.headers['content-type'] || '').startsWith('multipart/')) return next();
    return express.json({ limit: '1mb' })(req, res, next);
  });

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'kolkli-send', storage: config.storage.driver }));

  app.use('/internal/blob', blobRouter);
  app.use('/api/public/deliveries', publicRouter);
  app.use('/api/deliveries', ownerRouter);

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => sendError(res, err));
  return app;
}

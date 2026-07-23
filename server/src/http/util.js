// Small HTTP helpers.
export function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || '';
}

export function userAgent(req) {
  return (req.headers['user-agent'] || '').slice(0, 400);
}

export function sendError(res, err) {
  const status = err.status || 500;
  const body = { error: err.code || 'internal_error' };
  if (err.message && err.code && err.message !== err.code) body.message = err.message;
  if (err.extra) Object.assign(body, err.extra);
  if (status >= 500) console.error('server error:', err.stack || err.message);
  res.status(status).json(body);
}

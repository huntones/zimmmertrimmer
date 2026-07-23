// Typed API error + a small async wrapper so route handlers can throw.
export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    if (extra) this.extra = extra;
  }
}

export const badRequest   = (code, msg, extra) => new ApiError(400, code, msg, extra);
export const unauthorized = (code, msg) => new ApiError(401, code, msg);
export const forbidden    = (code, msg) => new ApiError(403, code, msg);
export const notFound     = (code = 'not_found', msg) => new ApiError(404, code, msg);
export const conflict     = (code, msg) => new ApiError(409, code, msg);
export const gone         = (code, msg) => new ApiError(410, code, msg);
export const tooMany      = (code = 'rate_limited', msg, retryAfterSec) =>
  new ApiError(429, code, msg, retryAfterSec ? { retry_after: retryAfterSec } : undefined);

// Wrap an async express handler so thrown errors reach the error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Central config. Reads .env (via dotenv) with safe local defaults.
// Nothing here throws on missing values — the local demo defaults keep
// the whole backend runnable with zero setup, mirroring the front-end's
// "works out of the box, plug in real creds later" philosophy.
import 'dotenv/config';

function int(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
function str(v, d) { return (v == null || v === '') ? d : String(v); }
function list(v, d) {
  const s = str(v, d);
  return s === '*' ? '*' : s.split(',').map(x => x.trim()).filter(Boolean);
}

const config = {
  port: int(process.env.PORT, 8787),
  allowedOrigin: list(process.env.ALLOWED_ORIGIN, '*'),
  publicBaseUrl: str(process.env.PUBLIC_BASE_URL, 'http://localhost:8787').replace(/\/+$/, ''),

  databaseUrl: str(process.env.DATABASE_URL, ''), // '' => embedded Postgres

  ownerJwtSecret: str(process.env.SUPABASE_JWT_SECRET, 'dev-only-owner-jwt-secret-change-me-please-32+chars'),

  publicSessionSecret: str(process.env.PUBLIC_SESSION_SECRET, 'dev-only-public-session-secret-change-me-please'),
  publicSessionTtlMin: int(process.env.PUBLIC_SESSION_TTL_MIN, 60),

  presignSecret: str(process.env.PRESIGN_SECRET, 'dev-only-presign-secret-change-me-please'),
  presignTtlSec: int(process.env.PRESIGN_TTL_SEC, 300),

  storage: {
    driver: str(process.env.STORAGE_DRIVER, 'local'),
    localDir: str(process.env.STORAGE_LOCAL_DIR, './.storage'),
    r2: {
      accountId: str(process.env.R2_ACCOUNT_ID, ''),
      bucket: str(process.env.R2_BUCKET, 'kolkli-files'),
      accessKeyId: str(process.env.R2_ACCESS_KEY_ID, ''),
      secretAccessKey: str(process.env.R2_SECRET_ACCESS_KEY, ''),
    },
  },

  mail: {
    driver: str(process.env.MAIL_DRIVER, 'console'),
    provider: str(process.env.MAIL_PROVIDER, 'resend'),
    from: str(process.env.MAIL_FROM, 'KOLKLI <verify@YOUR-DOMAIN.com>'),
    brand: str(process.env.MAIL_BRAND, 'KOLKLI'),
    apiKey: str(process.env.MAIL_API_KEY, ''),
  },

  maxFileBytes: int(process.env.MAX_FILE_BYTES, 500 * 1024 * 1024),

  verify: {
    codeTtlMin: int(process.env.VERIFY_CODE_TTL_MIN, 10),
    maxAttempts: int(process.env.VERIFY_MAX_ATTEMPTS, 5),
  },

  expirySweepSec: int(process.env.EXPIRY_SWEEP_SEC, 300),

  get isProd() { return process.env.NODE_ENV === 'production'; },
};

export default config;

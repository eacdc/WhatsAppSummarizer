import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function opt(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${name} must be a number`);
  return n;
}

export const config = {
  mongodbUri: req('MONGODB_URI'),

  maytapi: {
    productId: req('MAYTAPI_PRODUCT_ID'),
    phoneId: req('MAYTAPI_PHONE_ID'),
    token: req('MAYTAPI_TOKEN'),
    timeoutMs: num('MAYTAPI_TIMEOUT_MS', 20000),
    retries: num('MAYTAPI_RETRIES', 3),
  },

  pollCron: opt('POLL_CRON', '*/5 * * * *'),
  cursorOverlapSeconds: num('CURSOR_OVERLAP_SECONDS', 60),
  messageTtlSeconds: num('MESSAGE_TTL_SECONDS', 5184000),

  adminPhone: process.env.ADMIN_PHONE || '',
  defaultOwnerPhone: process.env.DEFAULT_OWNER_PHONE || '',
  dashboardBaseUrl: opt('DASHBOARD_BASE_URL', 'http://localhost:3000'),

  port: num('PORT', 3000),
  tz: opt('TZ', 'Asia/Kolkata'),
  logLevel: opt('LOG_LEVEL', 'info'),
  nodeEnv: opt('NODE_ENV', 'development'),
};

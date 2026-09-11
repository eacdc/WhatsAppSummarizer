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
  mongodbUri: req('MONGODB_URI_WA'),

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

  llm: {
    provider: opt('LLM_PROVIDER', 'openai'),
    fastModel: opt('LLM_MODEL_FAST', 'gpt-5-mini'),
    strongModel: opt('LLM_MODEL_STRONG', 'gpt-5'),
    contextMessages: num('LLM_CONTEXT_MESSAGES', 15),
  },
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  /** Fallbacks when no routing row supplies them. */
  defaultCooldownMin: num('DEFAULT_COOLDOWN_MIN', 30),
  defaultEscalateAfterMin: num('DEFAULT_ESCALATE_AFTER_MIN', 30),

  adminPhone: process.env.ADMIN_PHONE || '',
  defaultOwnerPhone: process.env.DEFAULT_OWNER_PHONE || '',
  dashboardBaseUrl: opt('DASHBOARD_BASE_URL', 'http://localhost:3000'),

  port: num('PORT', 3000),
  tz: opt('TZ', 'Asia/Kolkata'),
  logLevel: opt('LOG_LEVEL', 'info'),
  nodeEnv: opt('NODE_ENV', 'development'),
};

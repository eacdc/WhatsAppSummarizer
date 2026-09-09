import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './logger.js';
import { connect, ensureIndexes, runs, close } from './db.js';
import { runPoll, checkSession } from './poller/poll.js';

async function main() {
  await connect();
  await ensureIndexes();

  const app = express();

  app.get('/health', async (_req, res) => {
    const out: Record<string, unknown> = { ok: true };
    try {
      const lastRun = await runs().find({}).sort({ startedAt: -1 }).limit(1).next();
      out.db = 'ok';
      out.lastRunAt = lastRun?.startedAt ?? null;
      out.lastRunAgeSeconds = lastRun ? Math.round((Date.now() - lastRun.startedAt.getTime()) / 1000) : null;
      out.lastRunErrors = lastRun?.errors ?? [];
    } catch (err) {
      out.ok = false;
      out.db = String(err);
    }
    try {
      out.maytapiSession = (await checkSession()).ok ? 'logged_in' : 'logged_out';
    } catch (err) {
      out.ok = false;
      out.maytapiSession = String(err);
    }
    res.status(out.ok ? 200 : 503).json(out);
  });

  app.get('/', (_req, res) => res.type('text').send('WhatsApp Monitor — dashboard lands in phase 5.'));

  app.listen(config.port, () => logger.info({ port: config.port }, 'http listening'));

  let polling = false;
  cron.schedule(
    config.pollCron,
    async () => {
      if (polling) return logger.warn('previous poll still running — skipping this tick');
      polling = true;
      try { await runPoll(); } catch (err) { logger.error({ err: String(err) }, 'poll run threw'); }
      finally { polling = false; }
    },
    { timezone: config.tz },
  );
  logger.info({ cron: config.pollCron, tz: config.tz }, 'poller scheduled');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => { await close(); process.exit(0); });
}

main().catch((err) => { logger.error({ err: String(err) }, 'fatal'); process.exit(1); });

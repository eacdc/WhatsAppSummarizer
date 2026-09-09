import { config } from '../config.js';
import { logger } from '../logger.js';

const BASE = 'https://api.maytapi.com/api';

export class MaytapiError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
    this.name = 'MaytapiError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single entry point for every Maytapi HTTP call.
 * Retries 3x with exponential backoff on network errors and 5xx / 429.
 * 4xx (other than 429) fail fast — retrying a bad request is pointless.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASE}/${path}`;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= config.maytapi.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.maytapi.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'x-maytapi-key': config.maytapi.token,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });

      const text = await res.text();
      let body: unknown;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }

      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        const err = new MaytapiError(`Maytapi ${res.status} on ${path}`, res.status, body);
        if (!retryable) throw err;
        lastErr = err;
      } else {
        return body as T;
      }
    } catch (err) {
      if (err instanceof MaytapiError && !(err.status && (err.status >= 500 || err.status === 429))) {
        logger.error({ path, status: err.status, body: err.body }, 'maytapi call failed (non-retryable)');
        throw err;
      }
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < config.maytapi.retries) {
      const backoff = 500 * 2 ** (attempt - 1);
      logger.warn({ path, attempt, backoff, err: String(lastErr) }, 'maytapi call failed, retrying');
      await sleep(backoff);
    }
  }

  logger.error({ path, err: String(lastErr) }, 'maytapi call failed after all retries');
  throw lastErr instanceof Error ? lastErr : new MaytapiError(String(lastErr));
}

const phoneScope = () => `${config.maytapi.productId}/${config.maytapi.phoneId}`;

export const maytapi = {
  /** Raw responses — callers normalise via src/maytapi/normalise.ts. */
  getStatus: () => request<unknown>(`${phoneScope()}/getStatus`),
  getGroups: () => request<unknown>(`${phoneScope()}/getGroups`),
  getMessages: (conversationId: string) =>
    request<unknown>(`${phoneScope()}/getMessages/${encodeURIComponent(conversationId)}`),
  listPhones: () => request<unknown>(`${config.maytapi.productId}/listPhones`),
  sendMessage: (to: string, message: string) =>
    request<unknown>(`${phoneScope()}/sendMessage`, {
      method: 'POST',
      body: JSON.stringify({ to_number: to, type: 'text', message }),
    }),
  request,
};

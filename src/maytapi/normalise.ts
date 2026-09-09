/**
 * ============================================================================
 * THE ONLY FILE THAT KNOWS MAYTAPI'S RESPONSE SHAPE.
 * ============================================================================
 * maytapi.com was unreachable from the build environment, so the field names
 * below are BEST-EFFORT and defensive: each value is read from a list of
 * candidate keys. Paste one real getMessages/getGroups response into
 * `tests/fixtures/` and trim these candidate lists down to the real names —
 * nothing else in the codebase needs to change.
 */

export interface RawMessage {
  msgId: string;
  senderId: string | null;
  senderName: string | null;
  ts: Date;
  text: string;
  type: string;
  mediaUrl: string | null;
  quotedMsgId: string | null;
}

export interface RawGroup {
  id: string;
  name: string;
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    const parts = k.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') { cur = undefined; break; }
      cur = cur[p];
    }
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

/**
 * Maytapi timestamps are epoch SECONDS (10 digits) in most responses, but some
 * fields are milliseconds. Normalise both to a BSON Date — the TTL index
 * depends on this being a real Date.
 */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return toDate(Number(value));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Find the array of items in an envelope of unknown shape. */
function itemsOf(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'messages', 'result', 'groups', 'items']) {
    const v = payload?.[key];
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.messages)) return v.messages;
    if (v && Array.isArray(v.data)) return v.data;
  }
  return [];
}

export function normaliseMessages(payload: unknown): RawMessage[] {
  const out: RawMessage[] = [];
  for (const raw of itemsOf(payload)) {
    const msgId = pick(raw, ['id', 'msgId', 'message.id', 'message._serialized', '_serialized', 'key.id']);
    const ts = toDate(pick(raw, ['timestamp', 'ts', 't', 'time', 'message.timestamp', 'created_at']));
    if (!msgId || !ts) continue; // unusable without an id and a timestamp

    out.push({
      msgId: String(msgId),
      senderId: str(pick(raw, ['user.id', 'author', 'from', 'sender.id', 'participant', 'message.author'])),
      senderName: str(pick(raw, ['user.name', 'senderName', 'sender.name', 'notifyName', 'pushname'])),
      ts,
      text: str(pick(raw, ['message.text', 'text', 'body', 'message.caption', 'caption', 'message.body'])) ?? '',
      type: str(pick(raw, ['message.type', 'type'])) ?? 'text',
      mediaUrl: str(pick(raw, ['message.url', 'media', 'mediaUrl', 'url'])),
      quotedMsgId: str(pick(raw, ['message.quoted.id', 'quotedMsgId', 'quotedMsg.id', 'reply_to', 'quotedMessageId'])),
    });
  }
  return out;
}

export function normaliseGroups(payload: unknown): RawGroup[] {
  const out: RawGroup[] = [];
  for (const raw of itemsOf(payload)) {
    const id = pick(raw, ['id', 'conversation_id', 'chatId', '_serialized']);
    if (!id) continue;
    out.push({ id: String(id), name: str(pick(raw, ['name', 'subject', 'title'])) ?? String(id) });
  }
  return out;
}

/** True when the WhatsApp-Web session is paired and usable. */
export function isLoggedIn(statusPayload: any): boolean {
  const s = statusPayload?.status ?? statusPayload?.data?.status ?? statusPayload;
  const state = String(s?.state ?? s?.status ?? s ?? '').toLowerCase();
  if (typeof s?.loggedIn === 'boolean') return s.loggedIn;
  return ['online', 'active', 'connected', 'ready', 'loading'].includes(state);
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

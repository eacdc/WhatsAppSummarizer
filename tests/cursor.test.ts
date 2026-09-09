import { describe, it, expect } from 'vitest';
import { filterNewMessages, newestOf } from '../src/poller/cursor.js';
import { toDate, normaliseMessages } from '../src/maytapi/normalise.js';

const at = (iso: string) => new Date(iso);
const msg = (id: string, iso: string) => ({
  msgId: id, senderId: null, senderName: null, ts: at(iso),
  text: '', type: 'text', mediaUrl: null, quotedMsgId: null,
});

describe('cursor filtering', () => {
  const joinedAt = at('2026-01-01T10:00:00Z');

  it('drops messages older than joinedAt', () => {
    const { keep } = filterNewMessages(
      [msg('a', '2026-01-01T09:59:00Z'), msg('b', '2026-01-01T10:01:00Z')],
      { joinedAt, lastTs: null }, 60,
    );
    expect(keep.map((m) => m.msgId)).toEqual(['b']);
  });

  it('re-fetches the 60s overlap window before lastTs', () => {
    const lastTs = at('2026-01-01T12:00:00Z');
    const { keep } = filterNewMessages(
      [
        msg('old', '2026-01-01T11:58:30Z'), // > 60s before cursor — dropped
        msg('overlap', '2026-01-01T11:59:30Z'), // inside overlap — kept (dup index drops it)
        msg('new', '2026-01-01T12:00:30Z'),
      ],
      { joinedAt, lastTs }, 60,
    );
    expect(keep.map((m) => m.msgId)).toEqual(['overlap', 'new']);
  });

  it('flags possible_gap when every fetched message is newer than the cursor', () => {
    const lastTs = at('2026-01-01T12:00:00Z');
    expect(filterNewMessages([msg('a', '2026-01-01T13:00:00Z')], { joinedAt, lastTs }, 60).possibleGap).toBe(true);
    expect(filterNewMessages(
      [msg('a', '2026-01-01T11:59:30Z'), msg('b', '2026-01-01T13:00:00Z')],
      { joinedAt, lastTs }, 60,
    ).possibleGap).toBe(false);
  });

  it('never flags a gap on the first poll', () => {
    expect(filterNewMessages([msg('a', '2026-01-01T13:00:00Z')], { joinedAt, lastTs: null }, 60).possibleGap).toBe(false);
  });

  it('picks the newest message for the cursor', () => {
    expect(newestOf([msg('a', '2026-01-01T10:00:00Z'), msg('b', '2026-01-01T12:00:00Z')])?.msgId).toBe('b');
    expect(newestOf([])).toBeNull();
  });
});

describe('timestamp normalisation', () => {
  it('treats 10-digit numbers as epoch seconds', () => {
    expect(toDate(1767261600)?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });
  it('treats 13-digit numbers as epoch millis', () => {
    expect(toDate(1767261600000)?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });
  it('accepts numeric strings and rejects junk', () => {
    expect(toDate('1767261600')?.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(toDate('not a date')).toBeNull();
    expect(toDate(null)).toBeNull();
  });
});

describe('message normalisation', () => {
  it('unwraps a { data: [...] } envelope and skips items with no id or timestamp', () => {
    const out = normaliseMessages({
      data: [
        { id: 'm1', timestamp: 1767261600, message: { text: 'Kolbus band hai', type: 'text' }, user: { id: '91@c.us', name: 'Ravi' } },
        { timestamp: 1767261601, message: { text: 'no id' } },
        { id: 'm3', message: { text: 'no timestamp' } },
      ],
    });
    expect(out.map((m) => m.msgId)).toEqual(['m1']);
    expect(out[0]).toMatchObject({ text: 'Kolbus band hai', senderName: 'Ravi', senderId: '91@c.us', type: 'text' });
    expect(out[0].ts.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });
});

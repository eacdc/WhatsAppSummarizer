import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseMessages, normaliseGroups, isLoggedIn } from '../src/maytapi/normalise.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getMessages.json', import.meta.url), 'utf8'),
);

describe('normaliseMessages against a real getMessages response', () => {
  const out = normaliseMessages(fixture);

  it('drops system "info" rows (group/add, group/leave, group/name)', () => {
    // The fixture holds 4 rows; one is a group/leave event with no text.
    expect(out).toHaveLength(3);
    expect(out.some((m) => m.type === 'info')).toBe(false);
  });

  it('reads the sender from uid, not from the message body', () => {
    expect(out[0].senderId).toBe('919000000001@c.us');
  });

  it('resolves the sender name through the data.users map', () => {
    expect(out[0].senderName).toBe('Ravi');
    expect(out[1].senderName).toBe('Sunil');
  });

  it('leaves senderName null when the sender is absent from data.users', () => {
    expect(out[2].senderId).toBe('919000000003@c.us');
    expect(out[2].senderName).toBeNull();
  });

  it('takes msgId from message.id and converts epoch seconds to a Date', () => {
    expect(out[0].msgId).toBe('false_120363000000000000@g.us_AAA111_1111@lid');
    expect(out[0].ts).toBeInstanceOf(Date);
    expect(out[0].ts.toISOString()).toBe('2026-08-09T18:22:11.000Z');
  });

  it('reads text and type from the message body', () => {
    expect(out[0].text).toBe('Kolbus band hai, urgent');
    expect(out[0].type).toBe('text');
  });

  it('reads the quoted message id from the top-level quotedMsg', () => {
    expect(out[1].quotedMsgId).toBe('false_120363000000000000@g.us_AAA111_1111@lid');
    expect(out[0].quotedMsgId).toBeNull();
  });

  it('carries fromMe through', () => {
    expect(out[0].fromMe).toBe(false);
    expect(out[1].fromMe).toBe(true);
  });

  it('returns an empty array rather than throwing on junk', () => {
    expect(normaliseMessages(null)).toEqual([]);
    expect(normaliseMessages({ success: false })).toEqual([]);
    expect(normaliseMessages({ data: { messages: 'nope' } })).toEqual([]);
  });
});

describe('normaliseGroups', () => {
  it('reads id and name from data[]', () => {
    const out = normaliseGroups({
      success: true,
      data: [
        { id: '120363000000000000@g.us', name: 'CDC Tangra Production' },
        { id: '120363000000000001@g.us' },
      ],
    });
    expect(out).toEqual([
      { id: '120363000000000000@g.us', name: 'CDC Tangra Production' },
      // A group with no name falls back to its id so it is still selectable.
      { id: '120363000000000001@g.us', name: '120363000000000001@g.us' },
    ]);
  });
});

describe('isLoggedIn', () => {
  it('recognises a live session', () => {
    expect(isLoggedIn({ success: true, status: { state: 'online' } })).toBe(true);
    expect(isLoggedIn({ data: { loggedIn: true } })).toBe(true);
  });
  it('recognises a dead one', () => {
    expect(isLoggedIn({ status: { state: 'qr-screen' } })).toBe(false);
    expect(isLoggedIn({ data: { loggedIn: false } })).toBe(false);
    expect(isLoggedIn(null)).toBe(false);
  });
});

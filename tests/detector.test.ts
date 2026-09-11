import { describe, it, expect } from 'vitest';
import { findDuplicate, type ConcernDoc } from '../src/detector/concerns.js';
import { parseConcerns, MalformedLlmOutput } from '../src/llm/parse.js';
import type { ConcernCandidate } from '../src/llm/types.js';

const NOW = new Date('2026-09-11T12:00:00Z');
const minsAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const concern = (over: Partial<ConcernDoc> = {}): ConcernDoc => ({
  groupId: 'g1',
  category: 'machine_breakdown',
  severity: 'high',
  summary: 'Kolbus down',
  ownerId: '919000000001',
  messageIds: ['m1'],
  firstMsgTs: minsAgo(10),
  status: 'open',
  createdAt: minsAgo(10),
  acknowledgedAt: null,
  resolvedAt: null,
  escalatedTo: [],
  ...over,
});

const candidate = (over: Partial<ConcernCandidate> = {}): ConcernCandidate => ({
  messageIds: ['m2'],
  category: 'machine_breakdown',
  severity: 'high',
  summary: 'Kolbus still down',
  ownerHint: null,
  ...over,
});

describe('concern de-duplication', () => {
  it('matches an open concern of the same category inside the cooldown', () => {
    expect(findDuplicate(candidate(), [concern()], NOW, 30)).not.toBeNull();
  });

  it('does not match once the cooldown has passed', () => {
    expect(findDuplicate(candidate(), [concern({ createdAt: minsAgo(31) })], NOW, 30)).toBeNull();
  });

  it('treats an acknowledged concern as still live', () => {
    expect(findDuplicate(candidate(), [concern({ status: 'acknowledged' })], NOW, 30)).not.toBeNull();
  });

  it('does not match a resolved concern — that problem is closed', () => {
    expect(findDuplicate(candidate(), [concern({ status: 'resolved' })], NOW, 30)).toBeNull();
  });

  it('does not match a different category', () => {
    expect(findDuplicate(candidate({ category: 'quality_reprint' }), [concern()], NOW, 30)).toBeNull();
  });

  it('picks the newest match so appends follow the live thread', () => {
    const older = concern({ createdAt: minsAgo(20), summary: 'older' });
    const newer = concern({ createdAt: minsAgo(2), summary: 'newer' });
    expect(findDuplicate(candidate(), [older, newer], NOW, 30)?.summary).toBe('newer');
  });

  it('honours a per-route cooldown that differs from the default', () => {
    const c = concern({ createdAt: minsAgo(45) });
    expect(findDuplicate(candidate(), [c], NOW, 30)).toBeNull();
    expect(findDuplicate(candidate(), [c], NOW, 60)).not.toBeNull();
  });
});

describe('parsing the classifier output', () => {
  const known = new Set(['m1', 'm2']);

  it('accepts a clean response', () => {
    const out = parseConcerns(
      '{"concerns":[{"messageIds":["m1"],"category":"machine_breakdown","severity":"high","summary":"Kolbus down","ownerHint":"maintenance"}]}',
      known,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ category: 'machine_breakdown', severity: 'high', ownerHint: 'maintenance' });
  });

  it('accepts an empty result — the common case', () => {
    expect(parseConcerns('{"concerns":[]}', known)).toEqual([]);
  });

  it('strips a markdown fence rather than failing over it', () => {
    const out = parseConcerns(
      '```json\n{"concerns":[{"messageIds":["m1"],"category":"safety","severity":"high","summary":"burn"}]}\n```',
      known,
    );
    expect(out).toHaveLength(1);
  });

  it('drops hallucinated message ids, and the concern if none survive', () => {
    const out = parseConcerns(
      '{"concerns":[{"messageIds":["m1","nope"],"category":"safety","severity":"low","summary":"a"},{"messageIds":["ghost"],"category":"safety","severity":"low","summary":"b"}]}',
      known,
    );
    expect(out).toHaveLength(1);
    expect(out[0].messageIds).toEqual(['m1']);
  });

  it('coerces unknown categories and severities instead of rejecting', () => {
    const out = parseConcerns(
      '{"concerns":[{"messageIds":["m1"],"category":"made_up","severity":"catastrophic","summary":"x"}]}',
      known,
    );
    expect(out[0]).toMatchObject({ category: 'other', severity: 'low' });
  });

  it('throws on malformed output so the caller can escalate', () => {
    expect(() => parseConcerns('sorry, I cannot help with that', known)).toThrow(MalformedLlmOutput);
    expect(() => parseConcerns('{"result":[]}', known)).toThrow(MalformedLlmOutput);
  });
});

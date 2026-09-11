import { CONCERN_CATEGORIES, type ConcernCandidate, type ConcernCategory, type Severity } from './types.js';

const CATEGORIES = new Set<string>(CONCERN_CATEGORIES);
const SEVERITIES = new Set<string>(['low', 'medium', 'high']);

export class MalformedLlmOutput extends Error {}

/**
 * Models sometimes wrap JSON in a markdown fence despite being told not to.
 * Strip it rather than failing — a fence is not a real disagreement.
 */
function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Parses and validates the classifier's output. Anything unrecognised throws —
 * a malformed response escalates to the strong model rather than being guessed at.
 * Unknown categories and severities are coerced rather than rejected: the shape
 * is what matters, and "other"/"low" is a safe landing spot.
 */
export function parseConcerns(raw: string, knownMsgIds: Set<string>): ConcernCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new MalformedLlmOutput(`not JSON: ${raw.slice(0, 200)}`);
  }

  const concerns = (parsed as any)?.concerns;
  if (!Array.isArray(concerns)) {
    throw new MalformedLlmOutput(`no "concerns" array: ${raw.slice(0, 200)}`);
  }

  const out: ConcernCandidate[] = [];
  for (const c of concerns) {
    if (!c || typeof c !== 'object') continue;

    const summary = typeof c.summary === 'string' ? c.summary.trim() : '';
    if (!summary) continue; // a concern with nothing to say is not a concern

    // Only ids we actually sent. A hallucinated id would break the link back
    // to the messages that triggered the alert.
    const messageIds = Array.isArray(c.messageIds)
      ? c.messageIds.filter((id: unknown): id is string => typeof id === 'string' && knownMsgIds.has(id))
      : [];
    if (messageIds.length === 0) continue;

    const category: ConcernCategory = CATEGORIES.has(c.category) ? c.category : 'other';
    const severity: Severity = SEVERITIES.has(c.severity) ? c.severity : 'low';
    const ownerHint = typeof c.ownerHint === 'string' && c.ownerHint.trim() ? c.ownerHint.trim() : null;

    out.push({ messageIds, category, severity, summary, ownerHint });
  }
  return out;
}

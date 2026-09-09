import type { RawMessage } from '../maytapi/normalise.js';

export interface CursorState {
  joinedAt: Date | null;
  lastTs: Date | null;
}

export interface FilterResult {
  keep: RawMessage[];
  /** Every fetched message is newer than lastTs — the fetch window may have overflowed. */
  possibleGap: boolean;
}

/**
 * Rules (from the spec, in order):
 *  - never ingest anything older than joinedAt
 *  - re-fetch a deliberate `overlapSeconds` window before lastTs; the unique
 *    index on msgId drops the duplicates
 */
export function filterNewMessages(
  fetched: RawMessage[],
  state: CursorState,
  overlapSeconds: number,
): FilterResult {
  const joinedAt = state.joinedAt ? state.joinedAt.getTime() : -Infinity;
  const floor = state.lastTs ? state.lastTs.getTime() - overlapSeconds * 1000 : -Infinity;

  const keep = fetched.filter((m) => {
    const t = m.ts.getTime();
    return t >= joinedAt && t > floor;
  });

  const possibleGap =
    state.lastTs !== null &&
    fetched.length > 0 &&
    fetched.every((m) => m.ts.getTime() > state.lastTs!.getTime());

  return { keep, possibleGap };
}

/** Newest message by timestamp; ties broken by fetch order (last wins). */
export function newestOf(msgs: RawMessage[]): RawMessage | null {
  let best: RawMessage | null = null;
  for (const m of msgs) {
    if (!best || m.ts.getTime() >= best.ts.getTime()) best = m;
  }
  return best;
}

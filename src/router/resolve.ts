export interface RoutingRow {
  groupId: string;          // a specific group id, or "*" for any group
  category: string;
  ownerPhone: string;
  cooldownMin?: number;
  escalateAfterMin?: number;
}

export interface Routing {
  ownerPhone: string;
  cooldownMin: number;
  escalateAfterMin: number;
  /** Which rule matched — useful in logs and on the dashboard. */
  matched: 'group_category' | 'any_group_category' | 'default';
}

/**
 * Most specific first: an exact groupId+category rule beats a "*"+category
 * rule, which beats DEFAULT_OWNER_PHONE. Returns null only when there is no
 * default configured either — in which case nobody can be alerted and the
 * caller must say so loudly rather than dropping the concern.
 */
export function resolveRouting(
  groupId: string,
  category: string,
  rows: RoutingRow[],
  defaults: { ownerPhone: string; cooldownMin: number; escalateAfterMin: number },
): Routing | null {
  const exact = rows.find((r) => r.groupId === groupId && r.category === category);
  const wildcard = rows.find((r) => r.groupId === '*' && r.category === category);
  const row = exact ?? wildcard;

  if (row) {
    return {
      ownerPhone: row.ownerPhone,
      cooldownMin: row.cooldownMin ?? defaults.cooldownMin,
      escalateAfterMin: row.escalateAfterMin ?? defaults.escalateAfterMin,
      matched: exact ? 'group_category' : 'any_group_category',
    };
  }

  if (!defaults.ownerPhone) return null;
  return {
    ownerPhone: defaults.ownerPhone,
    cooldownMin: defaults.cooldownMin,
    escalateAfterMin: defaults.escalateAfterMin,
    matched: 'default',
  };
}

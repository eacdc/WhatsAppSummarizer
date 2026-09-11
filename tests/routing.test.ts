import { describe, it, expect } from 'vitest';
import { resolveRouting, type RoutingRow } from '../src/router/resolve.js';
import { formatAlert } from '../src/router/alert.js';

const defaults = { ownerPhone: '919000000000', cooldownMin: 30, escalateAfterMin: 30 };

const rows: RoutingRow[] = [
  { groupId: '*', category: 'machine_breakdown', ownerPhone: '919000000002' },
  { groupId: 'g1', category: 'machine_breakdown', ownerPhone: '919000000001', cooldownMin: 15 },
  { groupId: '*', category: 'safety', ownerPhone: '919000000003', escalateAfterMin: 5 },
];

describe('routing resolution', () => {
  it('prefers an exact group+category rule over the wildcard', () => {
    const r = resolveRouting('g1', 'machine_breakdown', rows, defaults);
    expect(r).toMatchObject({ ownerPhone: '919000000001', matched: 'group_category', cooldownMin: 15 });
  });

  it('falls back to the wildcard rule for another group', () => {
    const r = resolveRouting('g2', 'machine_breakdown', rows, defaults);
    expect(r).toMatchObject({ ownerPhone: '919000000002', matched: 'any_group_category' });
  });

  it('falls back to the default owner when no rule matches', () => {
    const r = resolveRouting('g1', 'hr_attendance', rows, defaults);
    expect(r).toMatchObject({ ownerPhone: '919000000000', matched: 'default' });
  });

  it('inherits unset cooldown and escalation from the defaults', () => {
    expect(resolveRouting('g2', 'machine_breakdown', rows, defaults)).toMatchObject({
      cooldownMin: 30,
      escalateAfterMin: 30,
    });
    expect(resolveRouting('g2', 'safety', rows, defaults)).toMatchObject({
      cooldownMin: 30,
      escalateAfterMin: 5,
    });
  });

  it('returns null when nobody can be alerted at all', () => {
    expect(resolveRouting('g1', 'hr_attendance', [], { ...defaults, ownerPhone: '' })).toBeNull();
  });
});

describe('alert formatting', () => {
  it('renders severity, category, group, summary and a link', () => {
    const text = formatAlert(
      {
        _id: 'abc123' as any,
        groupId: 'g1',
        category: 'machine_breakdown',
        severity: 'high',
        summary: 'Kolbus down, urgent',
        ownerId: null,
        messageIds: [],
        firstMsgTs: new Date(),
        status: 'open',
        createdAt: new Date(),
        acknowledgedAt: null,
        resolvedAt: null,
        escalatedTo: [],
      },
      'CDC Tangra Production',
    );
    expect(text).toContain('⚠️ high · machine_breakdown');
    expect(text).toContain('Group: CDC Tangra Production');
    expect(text).toContain('Kolbus down, urgent');
    expect(text).toContain('Reply ACK');
    expect(text).toContain('/concerns/abc123');
  });
});

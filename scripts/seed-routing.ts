/**
 * Seeds owners and routing rules. Edit the two arrays below to match CDC's
 * actual people, then re-run — it upserts, so it is safe to run repeatedly.
 * No phone numbers live in application code; they live here and in Mongo.
 */
import { connect, owners, routing, close } from '../src/db.js';
import { CONCERN_CATEGORIES, type ConcernCategory } from '../src/llm/types.js';

interface Owner { _id: string; name: string; role: string; department: string; escalationTo: string | null }
interface Route { groupId: string; category: ConcernCategory; ownerPhone: string; cooldownMin?: number; escalateAfterMin?: number }

// Phones are international format, no "+" and no spaces — the same form Maytapi wants.
const OWNERS: Owner[] = [
  // { _id: '919830000001', name: 'Production Head', role: 'production', department: 'tangra', escalationTo: '919830000009' },
];

const ROUTING: Route[] = [
  // { groupId: '*', category: 'machine_breakdown', ownerPhone: '919830000001', cooldownMin: 30, escalateAfterMin: 30 },
];

await connect();

for (const o of OWNERS) {
  await owners().updateOne({ _id: o._id }, { $set: o }, { upsert: true });
  console.log(`owner  ${o._id}  ${o.name}`);
}

for (const r of ROUTING) {
  await routing().updateOne(
    { groupId: r.groupId, category: r.category },
    { $set: r },
    { upsert: true },
  );
  console.log(`route  ${r.groupId} / ${r.category} -> ${r.ownerPhone}`);
}

if (OWNERS.length === 0 && ROUTING.length === 0) {
  console.log('Nothing seeded — the OWNERS and ROUTING arrays in this script are empty.');
  console.log('Until you fill them in, every concern routes to DEFAULT_OWNER_PHONE.');
  console.log(`\nValid categories: ${CONCERN_CATEGORIES.join(', ')}`);
}

await close();

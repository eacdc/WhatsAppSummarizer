/**
 * Turn monitoring on or off for a group, without touching Mongo by hand.
 *
 *   npx tsx scripts/set-monitored.ts                 # list groups + their state
 *   npx tsx scripts/set-monitored.ts <groupId> on    # start watching (sets joinedAt = now)
 *   npx tsx scripts/set-monitored.ts <groupId> off   # stop watching
 *
 * Turning a group ON sets joinedAt to this moment if it has never been set, so
 * nothing older than right now is ever ingested. Turning it off and on again
 * does NOT reset joinedAt — the original floor stands.
 */
import { connect, groups, close } from '../src/db.js';

const [groupId, state] = process.argv.slice(2);

if (!groupId) {
  await connect();
  const all = await groups().find({}).sort({ name: 1 }).toArray();
  if (all.length === 0) {
    console.log('No groups yet. Run `npm run seed` first.');
  } else {
    console.log(`${all.length} group(s):\n`);
    for (const g of all) {
      const flag = g.monitored ? '[ON ]' : '[off]';
      const since = g.joinedAt ? ` since ${g.joinedAt.toISOString()}` : '';
      const last = g.lastTs ? ` lastTs=${g.lastTs.toISOString()}` : '';
      console.log(`${flag} ${g._id}\n      ${g.name}${since}${last}`);
    }
    console.log('\nUsage: npx tsx scripts/set-monitored.ts <groupId> on|off');
  }
  await close();
  process.exit(0);
}

if (state !== 'on' && state !== 'off') {
  console.error('Second argument must be "on" or "off".');
  process.exit(1);
}

await connect();
const group = await groups().findOne({ _id: groupId });
if (!group) {
  console.error(`No group with id "${groupId}". Run \`npm run seed\`, or run this with no arguments to list them.`);
  await close();
  process.exit(1);
}

const monitored = state === 'on';
const update: Record<string, unknown> = { monitored };
if (monitored && !group.joinedAt) update.joinedAt = new Date();

await groups().updateOne({ _id: groupId }, { $set: update });
console.log(`${group.name} — monitoring ${monitored ? 'ON' : 'off'}`);
if (update.joinedAt) console.log(`joinedAt set to ${(update.joinedAt as Date).toISOString()} — nothing older will ever be ingested.`);
await close();

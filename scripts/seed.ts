/**
 * Creates indexes (including the messages TTL index) and imports the groups the
 * CDC number can see from Maytapi, leaving them all `monitored: false`.
 * Safe to re-run: nothing is overwritten except the group's name.
 */
import { connect, ensureIndexes, groups, close } from '../src/db.js';
import { maytapi } from '../src/maytapi/client.js';
import { normaliseGroups } from '../src/maytapi/normalise.js';

await connect();
await ensureIndexes();

const raw = await maytapi.getGroups();
const found = normaliseGroups(raw);
console.log(`maytapi returned ${found.length} groups`);

for (const g of found) {
  await groups().updateOne(
    { _id: g.id },
    {
      $set: { name: g.name },
      $setOnInsert: {
        monitored: false,
        department: null,
        joinedAt: null,
        lastTs: null,
        lastMsgId: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunError: null,
      },
    },
    { upsert: true },
  );
  console.log(`  ${g.id}  ${g.name}`);
}

console.log('\nFlip one on with:');
console.log('  db.groups.updateOne({_id: "<groupId>"}, {$set: {monitored: true, joinedAt: new Date()}})');
await close();

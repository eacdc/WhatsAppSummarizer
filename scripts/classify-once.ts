/**
 * Runs the detector over a group's unclassified messages right now, instead of
 * waiting for the next poll. Sends real alerts — it is the live path, not a dry run.
 *
 *   npx tsx scripts/classify-once.ts <groupId>
 */
import { connect, groups, close } from '../src/db.js';
import { detectForGroup } from '../src/detector/detect.js';

const groupId = process.argv[2];
if (!groupId) {
  console.error('usage: tsx scripts/classify-once.ts <groupId>');
  process.exit(1);
}

await connect();
const group = await groups().findOne({ _id: groupId });
if (!group) {
  console.error(`No group "${groupId}". Run \`npm run groups\` to list them.`);
  await close();
  process.exit(1);
}

const raised = await detectForGroup(group);
console.log(`\n${raised} new concern(s) raised.`);
await close();

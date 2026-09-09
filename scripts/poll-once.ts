/** Run a single poll cycle and exit. Useful for local verification. */
import { connect, ensureIndexes, close } from '../src/db.js';
import { runPoll } from '../src/poller/poll.js';

await connect();
await ensureIndexes();
const run = await runPoll();
console.log(JSON.stringify(run, null, 2));
await close();

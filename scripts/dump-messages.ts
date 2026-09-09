/**
 * Prints the RAW getMessages response for one conversation so the field names in
 * src/maytapi/normalise.ts can be pinned down against reality.
 *   npx tsx scripts/dump-messages.ts <conversationId>
 */
import { maytapi } from '../src/maytapi/client.js';

const id = process.argv[2];
if (!id) { console.error('usage: tsx scripts/dump-messages.ts <conversationId>'); process.exit(1); }
console.log(JSON.stringify(await maytapi.getMessages(id), null, 2));

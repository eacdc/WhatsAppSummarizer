import { MongoClient, Db, Collection } from 'mongodb';
import { config } from './config.js';
import { logger } from './logger.js';
import type { GroupDoc, MessageDoc, RunDoc } from './types.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(config.mongodbUri, { ignoreUndefined: true });
  await client.connect();
  db = client.db();
  logger.info({ db: db.databaseName }, 'mongo connected');
  return db;
}

export async function close(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

function coll<T extends object>(name: string): Collection<T> {
  if (!db) throw new Error('db not connected — call connect() first');
  return db.collection<T>(name);
}

export const groups = () => coll<GroupDoc>('groups');
export const messages = () => coll<MessageDoc>('messages');
export const runs = () => coll<RunDoc>('runs');
export const concerns = () => coll<any>('concerns');
export const alerts = () => coll<any>('alerts');
export const summaries = () => coll<any>('summaries');
export const owners = () => coll<any>('owners');
export const routing = () => coll<any>('routing');

/** Idempotent. Safe to run on every boot. */
export async function ensureIndexes(): Promise<void> {
  await messages().createIndex({ msgId: 1 }, { unique: true, name: 'msgId_unique' });
  await messages().createIndex({ groupId: 1, ts: -1 }, { name: 'group_ts' });
  await messages().createIndex(
    { receivedAt: 1 },
    { name: 'receivedAt_ttl', expireAfterSeconds: config.messageTtlSeconds },
  );
  await messages().createIndex({ groupId: 1, classified: 1 }, { name: 'group_classified' });

  await concerns().createIndex({ groupId: 1, category: 1, status: 1 }, { name: 'group_cat_status' });
  await concerns().createIndex({ createdAt: -1 }, { name: 'createdAt_desc' });
  await alerts().createIndex({ concernId: 1 }, { name: 'concernId' });
  await summaries().createIndex({ groupId: 1, kind: 1, periodEnd: -1 }, { name: 'group_kind_period' });
  await routing().createIndex({ groupId: 1, category: 1 }, { name: 'routing_lookup' });
  await runs().createIndex({ startedAt: -1 }, { name: 'startedAt_desc' });

  logger.info('indexes ensured');
}

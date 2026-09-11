import { config } from '../config.js';
import { logger } from '../logger.js';
import { groups, messages, runs } from '../db.js';
import { maytapi } from '../maytapi/client.js';
import { normaliseMessages, isLoggedIn } from '../maytapi/normalise.js';
import { filterNewMessages, newestOf } from './cursor.js';
import { detectForGroup } from '../detector/detect.js';
import type { GroupDoc, MessageDoc, RunDoc } from '../types.js';

let lastSessionAlertAt = 0;
const SESSION_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

export async function checkSession(): Promise<{ ok: boolean; raw: unknown }> {
  const raw = await maytapi.getStatus();
  const ok = isLoggedIn(raw);
  if (!ok && Date.now() - lastSessionAlertAt > SESSION_ALERT_COOLDOWN_MS) {
    lastSessionAlertAt = Date.now();
    logger.error({ raw }, 'maytapi session not logged in');
    if (config.adminPhone) {
      try {
        await maytapi.sendMessage(
          config.adminPhone,
          '⚠️ WhatsApp Monitor: the CDC WhatsApp session is not logged in. Re-pair the phone.',
        );
      } catch (err) {
        logger.error({ err: String(err) }, 'failed to send session alert');
      }
    }
  }
  return { ok, raw };
}

/** Poll one group. Never throws — errors are recorded on the group doc. */
export async function pollGroup(group: GroupDoc): Promise<{ ingested: number; error?: string }> {
  const now = new Date();

  // First ever poll: start the clock now, ingest nothing older.
  let joinedAt = group.joinedAt;
  if (!joinedAt) {
    joinedAt = now;
    await groups().updateOne({ _id: group._id }, { $set: { joinedAt } });
    logger.info({ groupId: group._id }, 'first poll — joinedAt set to now');
  }

  try {
    const payload = await maytapi.getMessages(group._id);
    const fetched = normaliseMessages(payload);

    const { keep, possibleGap } = filterNewMessages(
      fetched,
      { joinedAt, lastTs: group.lastTs },
      config.cursorOverlapSeconds,
    );

    if (possibleGap) {
      logger.warn(
        { groupId: group._id, fetched: fetched.length, lastTs: group.lastTs },
        'possible_gap: every fetched message is newer than the cursor',
      );
    }

    let ingested = 0;
    if (keep.length > 0) {
      const docs: MessageDoc[] = keep.map((m) => ({
        msgId: m.msgId,
        groupId: group._id,
        senderId: m.senderId,
        senderName: m.senderName,
        ts: m.ts,
        receivedAt: now,
        text: m.text,
        type: m.type,
        mediaUrl: m.mediaUrl,
        quotedMsgId: m.quotedMsgId,
        fromMe: m.fromMe,
        classified: false,
      }));

      try {
        const res = await messages().insertMany(docs, { ordered: false });
        ingested = res.insertedCount;
      } catch (err: any) {
        // Duplicate-key errors are expected — that's the overlap window working.
        if (err?.code === 11000 || err?.writeErrors) {
          ingested = err.result?.nInserted ?? err.insertedCount ?? 0;
          const nonDup = (err.writeErrors ?? []).filter((e: any) => e.code !== 11000);
          if (nonDup.length) throw err;
        } else {
          throw err;
        }
      }
    }

    const newest = newestOf(keep) ?? newestOf(fetched);
    const update: Partial<GroupDoc> = {
      lastRunAt: now,
      lastRunStatus: 'ok',
      lastRunError: null,
    };
    if (newest && (!group.lastTs || newest.ts > group.lastTs)) {
      update.lastTs = newest.ts;
      update.lastMsgId = newest.msgId;
    }
    await groups().updateOne({ _id: group._id }, { $set: update });

    logger.info(
      { groupId: group._id, fetched: fetched.length, kept: keep.length, ingested },
      'group polled',
    );
    return { ingested };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ groupId: group._id, err: message }, 'group poll failed');
    await groups().updateOne(
      { _id: group._id },
      { $set: { lastRunAt: now, lastRunStatus: 'error', lastRunError: message } },
    );
    return { ingested: 0, error: message };
  }
}

/** One full poll cycle across every monitored group. Never throws. */
export async function runPoll(): Promise<RunDoc> {
  const run: RunDoc = {
    startedAt: new Date(),
    finishedAt: null,
    groupsPolled: 0,
    messagesIngested: 0,
    concernsRaised: 0,
    errors: [],
  };

  try {
    const session = await checkSession();
    if (!session.ok) run.errors.push({ scope: 'session', message: 'maytapi session not logged in' });
  } catch (err) {
    run.errors.push({ scope: 'session', message: String(err) });
  }

  const monitored = await groups().find({ monitored: true }).toArray();
  for (const group of monitored) {
    const { ingested, error } = await pollGroup(group);
    run.groupsPolled += 1;
    run.messagesIngested += ingested;
    if (error) run.errors.push({ groupId: group._id, scope: 'poll', message: error });

    // Runs even when this cycle ingested nothing — a previous cycle may have
    // stored messages the detector has not reached yet.
    try {
      run.concernsRaised += await detectForGroup(group);
    } catch (err) {
      run.errors.push({ groupId: group._id, scope: 'detect', message: String(err) });
    }
  }

  run.finishedAt = new Date();
  await runs().insertOne(run);
  logger.info(
    {
      groups: run.groupsPolled,
      ingested: run.messagesIngested,
      concerns: run.concernsRaised,
      errors: run.errors.length,
    },
    'poll run finished',
  );
  return run;
}

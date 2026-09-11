# WhatsApp Office-Group Monitor

Reads CDC Printers' WhatsApp work groups through [Maytapi](https://maytapi.com),
keeps a rolling summary per group on a dashboard, and DMs the responsible person
when a message signals a concern. **It never posts into a group** — alerts go out
as 1:1 DMs only.

Status: **Phase 1** (scaffold, Maytapi client, poller, Mongo schema/indexes).
Phases 2–6 (detector, router, escalation, summariser, dashboard, deploy) are not built yet.

## Setup

```bash
npm install
cp .env.example .env      # fill in Mongo + Maytapi credentials (MONGODB_URI_WA)
npm run seed              # creates indexes, imports groups (all monitored: false)
npm run poll:once         # one poll cycle, prints the run doc
npm run dev               # http server on :3000 + cron poller
```

`GET /health` reports db status, Maytapi session status, and last-run age.

## Pairing the phone

Pair the dedicated CDC number in the Maytapi console (scan the QR from
WhatsApp → Linked devices). The endpoint is `/{phone_id}/status` (not `getStatus`). `GET /health` shows `maytapiSession: logged_in`
once it is up. If the session drops, the poller DMs `ADMIN_PHONE` at most once
every 30 minutes.

## Adding a group

The CDC number must already be a member. Then:

```bash
npm run seed   # re-import group list
```

and flip it on in Mongo:

```js
db.groups.updateOne({_id: "<groupId>"}, {$set: {monitored: true, joinedAt: new Date()}})
```

`joinedAt` is the hard floor: **messages older than it are never ingested**, on
any run, ever. Leave it null and the first poll sets it to that moment.

## How the cursor works

Per group we store `lastTs` (a BSON `Date`) and `lastMsgId`. Each run fetches the
group's messages and keeps those with `ts >= joinedAt` **and** `ts > lastTs - 60s`.
That 60-second overlap is deliberate — it costs a handful of re-fetched messages
and covers clock skew. Duplicates are dropped by the unique index on `msgId`
(`insertMany` runs with `ordered: false`; duplicate-key errors are swallowed and
not counted as inserts).

If every message Maytapi returns is newer than `lastTs`, we may have overflowed
the fetch window and lost messages in between — that logs a `possible_gap`
warning. See "Recovering from a gap" below.

## Retention

`messages` documents expire 60 days after `receivedAt` via a TTL index
(`MESSAGE_TTL_SECONDS`, default 5184000). Concerns, summaries, alerts and config
are **not** TTL'd. This is why timestamps are stored as BSON `Date` and never as
numbers or strings — a TTL index on a number does nothing.

## Recovering from a gap

Not built yet — `scripts/backfill-export.ts` (parses a WhatsApp "Export chat"
`.txt` and upserts into `messages`) lands in phase 6. Until then, a
`possible_gap` warning means shortening `POLL_CRON`.

## Maytapi response shape — OPEN QUESTION

`maytapi.com` was unreachable from the build environment, so
`src/maytapi/normalise.ts` reads each field from a **list of candidate key
names** rather than a verified one. It is the only file in the codebase that
knows Maytapi's shape. To pin it down:

```bash
npx tsx scripts/dump-messages.ts <conversationId>
```

Paste the output into `tests/`, trim the candidate lists to the real names, and
nothing else needs to change. Two things also still need confirming from the
docs: whether `getMessages` supports `limit`/`page`/`before` pagination (if it
does, the poller should page backwards until it crosses `lastTs`), and how many
messages it returns by default.

## Layout

```
src/config.ts            env parsing, all config in one place
src/db.ts                mongo connection + ensureIndexes() (idempotent)
src/maytapi/client.ts    every Maytapi call: retry x3, backoff, timeouts
src/maytapi/normalise.ts the only file that knows Maytapi's response shape
src/poller/cursor.ts     pure cursor/overlap filtering (unit tested)
src/poller/poll.ts       per-group poll, session check, run recording
src/index.ts             express /health + cron
scripts/                 seed, poll-once, dump-messages
```

No phone numbers, group ids or model names are hard-coded — they live in Mongo or env.

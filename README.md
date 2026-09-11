# WhatsApp Office-Group Monitor

Reads CDC Printers' WhatsApp work groups through [Maytapi](https://maytapi.com),
keeps a rolling summary per group on a dashboard, and DMs the responsible person
when a message signals a concern. **It never posts into a group** — alerts go out
as 1:1 DMs only.

Status: **Phase 2** (poller + concern detector + router/alerts).
Phases 3–6 (escalation/ACK, summariser, dashboard, deploy) are not built yet.

## Setup

```bash
npm install
cp .env.example .env      # fill in Mongo + Maytapi credentials (MONGODB_URI_WA)
npm run seed              # creates indexes, imports groups (all monitored: false)
npm run seed:routing      # owners + routing rules (edit the arrays in the script first)
npm run poll:once         # one poll cycle: fetch, classify, alert
npm run classify:once -- "<groupId>"   # classify now, without waiting for a poll
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

## How a concern becomes an alert

Every 5 minutes, after polling, each monitored group's unclassified messages go
to the LLM in **one call per group** — not one per message. The previous 15
already-classified messages ride along as context so a reply like "still down"
is intelligible; they are never re-flagged.

**Two tiers.** `LLM_MODEL_FAST` judges first. The batch is re-run on
`LLM_MODEL_STRONG` if the fast model flagged anything **high severity** or
returned **malformed JSON**. High severity is what interrupts someone's evening,
so it gets a second opinion.

**Messages are marked `classified` whatever happens next** — including when
routing is missing or the DM fails. Otherwise a permanent misconfiguration would
re-send the same batch to the LLM every 5 minutes forever, at real cost.

**De-duplication.** A new concern is absorbed by an existing `open` or
`acknowledged` concern of the same group and category raised within
`cooldownMin` (default 30): its message ids are appended and **no second alert
is sent**. One machine going down generates a dozen messages; that is one
problem. A `resolved` concern never absorbs — that problem is closed, and a
recurrence deserves a fresh alert.

**Routing**, most specific first: a `routing` row matching `groupId + category`,
then `"*" + category`, then `DEFAULT_OWNER_PHONE`. If none of the three resolves,
the concern is still recorded and an **error** is logged saying nobody was
alerted — silence there would be the worst possible failure.

**Alerts are written to `alerts` before the send**, then updated with the
delivery result. A crash mid-send leaves a record that we tried, rather than no
trace at all.

## Changing the prompt

`src/detector/prompt.md` is the classifier's system prompt — plain Markdown, no
code around it. Edit it and restart; nothing else needs touching. It carries the
CDC-specific vocabulary (romanised Hindi/Bengali signals, machine names, what
counts as routine chatter) and the severity definitions.

## Swapping the LLM

`src/llm/` is the only place a vendor SDK is imported. `LLM_PROVIDER` selects the
implementation; `LLM_MODEL_FAST` and `LLM_MODEL_STRONG` select the models. Adding
a provider means one new file implementing the `Llm` interface plus a case in
`src/llm/index.ts` — no change to the detector.

## Maytapi response shape

Pinned against a real `getMessages` response; `tests/fixtures/getMessages.json` is
a redacted copy and `tests/normalise.test.ts` asserts against it.

```
{ success, data: {
    users: { "<jid>": { id, name, phone, image? } },
    messages: [ { timestamp, uid, fromMe, message: { id, type, text }, quotedMsg? } ],
    me, participants } }
```

Two traps, both handled in `src/maytapi/normalise.ts` and both easy to
reintroduce:

- **The sender is `uid` on the envelope**, and the sender's *name* lives only in
  the `data.users` map, keyed by jid. Nothing on the message body identifies who
  sent it. A sender missing from `users` yields a null name, which is fine.
- **`message.type === "info"` rows are system events** (`group/add`,
  `group/leave`, `group/name`) with no text field at all. They are dropped, not
  stored — otherwise they reach the classifier as empty messages every run.

`timestamp` is epoch seconds, on the envelope rather than the message.

### Pagination

There is none, and none is needed. `getMessages` returns whatever history the
WhatsApp-Web session has lazily loaded, and that set *grows* on each call — one
group went 51 → 101 fetched across two consecutive polls with no new messages.
So messages cannot be lost by the fetch window sliding past them, and
`possible_gap` should stay silent in normal operation.

The cost is that the fetched count climbs over time; on a group with deep
history every poll re-fetches and re-filters the whole archive. Cheap for now,
worth capping before many groups are monitored.

## Layout

```
src/config.ts            env parsing, all config in one place
src/db.ts                mongo connection + ensureIndexes() (idempotent)
src/maytapi/client.ts    every Maytapi call: retry x3, backoff, timeouts
src/maytapi/normalise.ts the only file that knows Maytapi's response shape
src/poller/cursor.ts     pure cursor/overlap filtering (unit tested)
src/poller/poll.ts       per-group poll, session check, run recording
src/llm/                 the only place a vendor SDK is imported
src/llm/parse.ts         validates classifier JSON; throws to trigger escalation
src/detector/prompt.md   the classifier's system prompt — edit freely
src/detector/concerns.ts de-duplication rules (pure, unit tested)
src/detector/detect.ts   classify -> de-dup -> open concern -> alert
src/router/resolve.ts    routing precedence (pure, unit tested)
src/router/alert.ts      DM formatting and delivery logging
src/index.ts             express /health + cron
scripts/                 seed, poll-once, dump-messages
```

No phone numbers, group ids or model names are hard-coded — they live in Mongo or env.

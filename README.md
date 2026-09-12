# WhatsApp Office-Group Monitor — Frontend

The dashboard for CDC Printers' WhatsApp office-group monitor.

**Not built yet.** The backend is finished and its API is live; this repo holds
the dashboard that consumes it.

## Where the backend is

`eacdc/CDC-Site` → `src/whatsapp-monitor/`, with the API in
`src/routes-whatsapp-monitor.js`. That README covers the Maytapi response shape,
the cursor rules, how a concern becomes an alert, escalation and ACK, and the
summariser.

## The API

Base: `/api/whatsapp-monitor` on the CDC backend.

**Auth is the same JWT the other CDC tools use** — send
`Authorization: Bearer <token>`. Obtain it from `/api/cdc-bills/auth`. One login
across all CDC tools; there is no separate dashboard password. Admin-only routes
return 403 for non-admin users. Every route returns 401 without a valid token.

### Reads

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{enabled, db, lastRunAt, lastRunAgeSeconds, lastRunErrors, maytapiSession}` |
| GET | `/groups` | `{groups: [{...group, concernCounts: {open, acknowledged}, rollingSummary}]}` |
| GET | `/groups/:id` | `{group, dailySummaries[], rollingSummary, concerns[], messages[]}` — messages oldest-first, last 50 |
| GET | `/concerns` | `{concerns[], categories[], statuses[]}` — filter with `?status=&category=&groupId=&limit=` (max 500) |
| GET | `/concerns/:id` | `{concern, groupName, messages[], alerts[]}` |
| GET | `/runs` | `{runs[]}` — last 100 |
| GET | `/owners` | `{owners[], routing[], categories[], defaults}` |

### Writes

| Method | Path | Body | Admin |
|---|---|---|---|
| PATCH | `/groups/:id` | `{monitored?, department?, joinedAt?}` | yes |
| POST | `/concerns/:id/acknowledge` | — | no |
| POST | `/concerns/:id/resolve` | — | no |
| PUT | `/owners/:phone` | `{name, role, department, escalationTo}` | yes |
| DELETE | `/owners/:phone` | — | yes |
| PUT | `/routing` | `{groupId, category, ownerPhone, cooldownMin?, escalateAfterMin?}` | yes |
| DELETE | `/routing?groupId=&category=` | — | yes |

### Shapes

```jsonc
// concern
{ "_id", "groupId", "category", "severity",       // low | medium | high
  "summary", "ownerId", "messageIds": [],
  "firstMsgTs", "status",                          // open | acknowledged | resolved
  "createdAt", "acknowledgedAt", "resolvedAt",
  "escalatedTo": [], "lastEscalatedAt" }

// summary
{ "groupId", "kind",                               // rolling | daily
  "periodStart", "periodEnd", "dayKey",            // dayKey on daily only
  "bullets": { "decisions": [], "openIssues": [], "blocked": [], "notable": [] },
  "messageCount", "generatedAt", "model" }
```

Categories: `machine_breakdown`, `quality_reprint`, `delivery_delay`,
`customer_complaint`, `material_shortage`, `safety`, `hr_attendance`, `other`.

### Behaviour worth designing around

- **Acknowledge/resolve return 409** when someone else got there first, with the
  current state in the body. Show the new state rather than an error.
- **`/concerns/:id` can return fewer messages than `messageIds` lists.** Messages
  age out after 60 days; concerns do not. Say "N messages no longer retained"
  rather than rendering a gap.
- **`rollingSummary` and `dailySummaries` may be absent** for a group that has
  only just been switched on.
- **Empty bullet arrays are normal and correct** — a quiet window genuinely has
  nothing to report. Don't render four empty headings.

## Planned pages

- `/` — health strip (session logged in? last poll? errors in 24h?), then one
  card per monitored group: latest rolling summary, open concern count, last
  message time
- `/groups/:id` — daily summaries, rolling summary, live concerns, last 50
  messages
- `/concerns` — filterable table; a row opens the triggering messages, the alert
  log, and Acknowledge / Resolve
- `/admin/groups` — toggle `monitored`, edit `department`, set `joinedAt`
- `/admin/routing` — owners and routing rules
- `/admin/runs` — last 100 runs with counts and errors

Plain and fast, and readable on a phone — it gets opened one-handed on a shop
floor more often than at a desk.

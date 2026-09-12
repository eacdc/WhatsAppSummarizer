# WhatsApp Office-Group Monitor — Frontend

The dashboard for CDC Printers' WhatsApp office-group monitor.

Plain HTML, CSS and vanilla JS. **No build step, no dependencies, no framework** —
open a file and it runs, and deploying is copying six files to any static host.
That keeps it fast on shop-floor 4G and editable by anyone without a toolchain.

```
index.html     health strip + a card per monitored group
group.html     one group: summaries, concerns, last 50 messages
concerns.html  filterable list, and the detail view with Acknowledge / Resolve
admin.html     groups, owners + routing, and recent runs
app.js         API client, auth, formatting
style.css      the lot
```

## Running it

Point it at your backend by editing `DEFAULT_API` at the top of `app.js`
(`http://localhost:3001` by default). It can also be overridden per browser with
`localStorage.setItem('wa_api_base', 'https://…')`, which is handy for testing
against a deployed backend without editing the file.

Then serve the folder — any static server will do:

```bash
npx serve .          # or: python -m http.server 8080
```

Opening the files directly with `file://` will not work: the pages use ES
modules, which browsers refuse to load over `file://`.

Sign in with your CDC account — the same credentials as the other CDC tools. The
token is kept in `localStorage`; a 401 anywhere clears it and returns you to the
login form.

## Notes on the build

- **Mobile first.** On screens under 640px the tables restack as cards, because
  a five-column table pushes the summary — the only column that matters —
  off-screen. Verified at 420px and 1000px with no horizontal overflow.
- **Everything interpolated is escaped.** The content is WhatsApp messages
  written by people we do not control, so `esc()` guards every insertion.
- **Dark mode** follows the system setting.
- A **409** on acknowledge/resolve means someone else got there first; the page
  reloads to show the truth instead of arguing with it.

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

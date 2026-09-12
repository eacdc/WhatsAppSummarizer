# WhatsApp Office-Group Monitor — Frontend

The dashboard for CDC Printers' WhatsApp office-group monitor.

**Nothing is built here yet.** This repo held an earlier TypeScript copy of the
backend, which now lives in the CDC-Site backend instead; keeping two
implementations of the same logic in two repos is how a bug eventually gets
fixed in the wrong one, so that copy was removed. It remains in this repo's
git history if it is ever needed.

## Where the backend is

`eacdc/CDC-Site` → `src/whatsapp-monitor/`

That is where the poller, concern detector, router and alerting run — inside the
existing backend process, gated by `WHATSAPP_MONITOR_ENABLED`. Its README covers
the Maytapi response shape, the cursor rules, how a concern becomes an alert,
and how to change the classifier prompt.

## What goes here

A dashboard reading JSON routes served by that backend, behind the JWT auth the
other CDC tools already use — so no separate password to manage.

Planned pages (phase 5):

- `/` — health strip, then one card per monitored group: latest rolling
  summary, open concern count, last message time
- `/groups/:id` — daily summaries, rolling summary, open and acknowledged
  concerns, last 50 messages
- `/concerns` — filterable by status, category and group; a row opens the
  messages that triggered it, the alert log, and Acknowledge / Resolve
- `/admin/groups` — toggle `monitored`, edit `department`, set `joinedAt`
- `/admin/routing` — CRUD for owners and routing rules
- `/admin/runs` — the last 100 runs with counts and errors

Plain and fast, and readable on a phone — it gets opened one-handed on a shop
floor more often than at a desk.

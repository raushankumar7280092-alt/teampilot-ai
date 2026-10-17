# TeamPilot AI

A small project-coordination dashboard backed by Express and JSON files. It keeps the existing task list, manual status controls, and optional Telegram keyword updates, and adds a Gemini progress-report workflow, owner approvals, and a server-recorded activity timeline.

## What exists

- `public/index.html`, `public/styles.css`, and `public/app.js`: the dashboard, filters, task status controls, report form, approvals, activity timeline, and project summary chat.
- `server.js`: Express routes, Telegram keyword polling, Gemini validation, approvals, and persistence.
- `data/tasks.json`: current task records with a version number.
- `data/workflow.json`: created automatically for activity, approvals, and workflow checkpoints.
- The directory does not contain `public/dashboard.html` or a separate landing page; the current dashboard is `public/index.html`.

## Run locally

1. Use Node.js 20 or newer.
2. In this folder run `npm install` if dependencies are not installed.
3. Copy `.env.example` to `.env` and add a Gemini API key. `GEMINI_API_KEY` stays on the server. `GEMINI_MODEL` is optional and defaults to `gemini-3.8-flash`. `TELEGRAM_BOT_TOKEN` is optional.
4. Run `npm start` and open [http://localhost:5000](http://localhost:5000).

Without `GEMINI_API_KEY`, the dashboard reports **AI unavailable** and a report is not applied. The existing Telegram keyword parser can still run if `TELEGRAM_BOT_TOKEN` is configured. Demo profile selection is not secure authentication; this is not suitable for production access control.

## API

- `GET /api/health` → `{ success, message }`
- `GET /api/system` → `{ aiAvailable, provider }`
- `GET /api/profiles` → `{ profiles, notice }`
- `GET /api/tasks` → task array; each task includes `id`, `title`, `owner`, `status`, and `version`.
- `PATCH /api/tasks/:id` with `{ "status": "Blocked" }` → `{ success, task }`; returns 404 for unknown tasks and 400 for unsupported statuses.
- `POST /api/progress` with `{ "profileId": "aisha", "message": "...", "idempotencyKey": "unique-retry-key" }` → validated analysis, any automatic status change, blocker analysis, and approval IDs. An idempotency key is required so retrying the same submission cannot repeat the workflow. Missing Gemini key returns 503. Invalid model proposals are rejected and logged without applying them.
- `GET /api/approvals` → approvals still awaiting a decision.
- `POST /api/approvals/:id/decision` with `{ "profileId": "kabir", "decision": "approve" }`, `reject`, or `edit` plus `value` → owner decision result. Task version and profile permission are checked on the server.
- `GET /api/activity` → `{ events, blockers }` with timestamps and actual server-reported status.
- `POST /api/chat` with `{ "message": "..." }` → a saved-task summary. It is not a free-form AI chat.

## Two-minute demo

1. Start the server with a valid Gemini key. In the dashboard select Aisha and submit a real blocker report for a listed task.
2. Show the timeline's Running and Completed entries, the blocker explanation, impact, and recovery steps. If Gemini proposes an owner or deadline change, show its pending approval card.
3. Select Kabir (the demo owner) and approve, reject, or edit the proposed value. Show the resulting task and activity entry.
4. To demonstrate failure handling, temporarily remove the Gemini key and submit a new report. The server reports AI unavailable, records a failure, and leaves tasks unchanged. Restore the key before continuing.

No fake progress percentages or simulated success events are shown. A real Gemini call is required to demonstrate diagnosis and approval creation; without an API key, only the unavailable path can be demonstrated.

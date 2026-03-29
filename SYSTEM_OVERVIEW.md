# Escalation Engine – System Overview (Phase 1)

Audience: senior solution designer needing full context of the current implementation and assumptions.

## What the app does (today)
- Single-message “escalation engine” playground built on Next.js (App Router).
- User pastes a Slack/Email-style message, selects a simulated time (Working Hours / After Hours / Weekend), and runs analysis.
- Backend calls Groq’s OpenAI-compatible API (default model `llama-3.3-70b-versatile`) to return three prompt-variant decisions (Prompt A/B/C) for comparison.
- UI displays each variant’s urgency score, action decision, and reasoning; supports simple thumbs-up/down capture (local only) and shows fallback sample decisions when the model call fails.
- Phase 2 placeholder (UI only) for uploading CSV/Excel datasets; no backend implemented yet.

## Key features
- Prompt variant comparison (A/B/C) on a single input message.
- Simulated time context selector to influence urgency/action.
- Graceful degradation with canned fallback decisions and user-facing error messaging (429 quota / 401 auth / generic).
- Lightweight rating UI per variant (alert-based stub; no persistence).
- Clean, responsive layout with Tailwind v4-inlined styles and Geist font via `next/font`.

## Inputs & parameters
- **HTTP POST** `/api/analyze` (see `app/api/analyze/route.js`)
  - `message` (string, required): raw user-entered text.
  - `time` (string, required): one of `"Working Hours" | "After Hours" | "Weekend"`; defaults to `"Working Hours"`.
- **Environment**
  - `GROQ_API_KEY` (required): Groq API key; keep secret (present in `.env.local`, not committed).
  - `GROQ_MODEL` (optional): overrides model; defaults to `llama-3.3-70b-versatile`.

## Prompting strategy (server)
- **System prompt** (trimmed): instructs the model to act as a workplace escalation engine; assume colleague context; score urgency 0–10; pick one action from Escalate / Log / Mute; keep reasoning to 1–2 sentences; respect time context; return strictly JSON array of three prompt variants (Prompt A/B/C) with fields `{modelName, urgencyScore, actionDecision, reasoning}`.
- **User prompt**: injects the submitted `message` and `time`, reiterates required JSON schema and variant labels.
- `temperature: 0.4`; `response_format: { type: "json_object" }` to enforce JSON.

## Urgency & action definition
- **Urgency scale**: 0–10 (0 = no action; 10 = immediate interrupt).
- **Actions**:
  - Escalate — interrupt/phone immediately.
  - Log — record and handle later.
  - Mute — no action needed now.
- Time context (Working vs After Hours vs Weekend) should influence urgency; reasoning must justify action and score in 1–2 sentences.

## Outputs
- Success payload: `{ time, echoedMessage, results: [ { modelName, urgencyScore, actionDecision, reasoning }, ... ] }`
- Error/fallback payload (HTTP 200): adds `error`, `fallback: true`, `statusCode`, `errorDetail`, `model`.
- Frontend renders cards per variant; shows warning banner when `fallback` is true; displays error + detail if present.

## Error handling & fallback behavior
- Specific friendly messages for 429 (quota) and 401 (invalid/missing key); generic for other failures.
- If model call fails or returns empty results, server returns three canned decisions and marks `fallback: true`; UI warns user.

## Architecture & flow
1) **Client (`app/page.js`)**  
   - React client component; local state for form, loading, errors, ratings.  
   - Calls `/api/analyze` with `{ message, time }`; handles JSON response; shows skeleton during loading.  
   - Placeholder dropzone for future dataset upload (inactive).
2) **API route (`app/api/analyze/route.js`)**  
   - Uses `openai` SDK pointed to `https://api.groq.com/openai/v1`.  
   - Builds system + user prompts; enforces JSON response; parses results; returns structured payload or fallback.  
   - No persistence or external storage; purely stateless per request.
3) **Styling & assets**  
   - Tailwind v4 via PostCSS (`postcss.config.mjs`); custom globals in `app/globals.css`.  
   - Fonts via `next/font` (Geist Sans/Mono) in `app/layout.js`.  
   - Default Next.js metadata in `layout.js`.
4) **Tooling**  
   - Next.js 16.1.6, React 19.2.3.  
   - ESLint core-web-vitals preset; Tailwind 4; minimal config (`next.config.mjs` left default).

## Data & security notes
- No databases, queues, or file storage; all analysis is in-memory per request.
- Secrets: only `GROQ_API_KEY` required; keep in `.env.local` (excluded from git). Do **not** commit actual keys.
- User messages are only forwarded to Groq; not logged server-side except console errors during failures.

## Current limitations / design gaps
- Ratings are client-only alerts; no API or storage for feedback.
- Dataset upload path is not implemented; would need new API route + file parsing + batching of model calls.
- Single-model invocation; no multi-model comparison beyond prompt variants; no eval metrics.
- No auth or role separation; assumes trusted internal use.

## Quick start (dev)
```bash
npm install
GROQ_API_KEY=your_key_here npm run dev
# visit http://localhost:3000
```

## File map (key locations)
- `app/page.js` — client UI & interaction flow.
- `app/api/analyze/route.js` — backend prompt & Groq call, fallback logic.
- `app/layout.js`, `app/globals.css` — layout, fonts, theme.
- `package.json`, `postcss.config.mjs`, `eslint.config.mjs` — tooling/config.

## Feedback prompts for solution design
- Is the 0–10 + (Escalate/Log/Mute) taxonomy sufficient, or should thresholds/time weighting be explicitly defined?
- Should ratings and future dataset ingestion feed a fine-tuning/eval loop?
- Any PII/security requirements before enabling real-message uploads or storage?


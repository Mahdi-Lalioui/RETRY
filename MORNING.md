# Good morning: what to do first

The full app is built, tested locally, and pushed to `main`. Tonight it ran on the **mock Mubit client**, because this sandbox had no network access to Mubit or OpenAI. The TopBar shows a yellow **MOCK MODE** pill until real Mubit is configured.

## 1. Run it locally (2 min)
```bash
git pull
npm ci
cp .env.example .env.local     # then fill in the keys (see step 3)
npm run dev                    # open http://localhost:3000
npm test                       # all tests should be green
```
Hotkeys on Mission Control: `R` run · `J` judge's turn · `S` ship a new site version · `B` break checkout · `H` heal · `T` train now · `I` ICL lane · `D` demo replay · `Esc` stop · `?` how Mubit is used.

Pages: `/` Mission Control · `/lab` versions, held-out matrix, learning curve, ICL vs adapter · `/corrections` ledger of the exact training pairs · `/attract` expo loop.

## 2. Deploy to Vercel (5 min)
1. vercel.com → Add New → Project → import `Mahdi-Lalioui/RETRY` (Next.js is auto-detected; no settings to change).
2. Settings → Environment Variables: add everything from `.env.example` that you have values for (at minimum `OPENAI_API_KEY`, `MUBIT_API_KEY`).
3. Optional but recommended: Storage → add **Neon** Postgres, so `DATABASE_URL` is injected, then run `npm run db:push` locally with that URL. Without Neon the app uses an in-memory store per server instance and bootstraps itself on first load. That works for the demo, but data isn't shared between instances.
4. Deploy. The URL will be something like `retry-mahdi-2040.vercel.app`.

## 3. Make Mubit real: ask the Mubit team at kickoff (plan.md §3)
Put the answers into the env vars below, in Vercel and in `.env.local`. **No code changes are needed.**

| Question | Env var |
|---|---|
| Middleware base URL (OpenAI-compatible?) | `MUBIT_BASE_URL` |
| Auth: is it `Authorization: Bearer <key>`? (our key: `mbt_mw-app_…`) | `MUBIT_API_KEY` |
| Does OpenAI passthrough need our OpenAI key in a header? Which one? | `MUBIT_PROVIDER_KEY_HEADER` |
| Which open model id should we use? | `OPEN_BASE_MODEL` |
| Request-id response header used to link feedback to a call | `MUBIT_REQUEST_ID_HEADER` |
| Feedback/correction endpoint + payload shape | `MUBIT_FEEDBACK_URL` (shape: edit `toFeedbackPayload()` in `lib/mubit/client.ts`, the only place) |
| How to trigger an update / list versions | `MUBIT_REFRESH_URL`, `MUBIT_VERSIONS_URL` |
| How to call a specific version (model suffix? header?) | `MUBIT_VERSION_MODE`, `MUBIT_VERSION_SUFFIX_SEP`, `MUBIT_VERSION_HEADER` |

Then set `MUBIT_ENABLED=true` and run `npm run smoke:mubit`. It prints latency for chat, feedback and versions. The pill turns green ("routed via Mubit").

Also known, from the public `@mubit-ai/sdk` package: the control plane is `https://api.mubit.ai`, with HTTP routes `/v2/control/*` and Bearer auth. Set `MUBIT_MEMORY_FALLBACK=true` to also send step outcomes there.

## 4. Before the demo
- **Rotate both API keys after the hackathon.** They were pasted into chat.
- Rehearse plan.md §24 (3:00 script). If anything is flaky on stage, press `D` to replay the recorded run. It is clearly labelled as a replay.
- Stage tip: on T2 the Base lane breaks several rules in a row (R1, R6, R2, R4), because it never learns mid-run. Do the first rescue live, then press `Esc` to skip the rest so the 3:00 slot holds.
- R7 (gift wrap) appears after pressing `S` twice from the start (layout-v6). That's the live "new rule" moment. Rescue it, press `T`, watch v5 get promoted, then press `R` again.
- Verified overnight on a production build in Chromium: the full §24 flow, `/lab`, `/corrections`, `/attract`, zero console errors.
- Read `DECISIONS.md` (every choice made overnight) and `BLOCKED.md` (what needs you).

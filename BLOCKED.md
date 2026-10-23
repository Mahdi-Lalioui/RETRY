# Blocked items (need a human)

- **No network to Mubit or OpenAI from the build sandbox.** Every model call was exercised only on the mock client. The real client (`lib/mubit/client.ts`) was tested against a local fake OpenAI-compatible server. Fix: configure the env vars in MORNING.md §3, then run `npm run smoke:mubit`.
- **Mubit Middleware API details are not public**: base URL, feedback shape, version addressing. They're env-driven `TODO(MUBIT)` placeholders. Ask the Mubit team (plan.md §3).
- **Vercel deploy** needs your account. There was no Vercel token, by choice. Steps are in MORNING.md §2.
- **Neon database** is optional. Without it, the deployed app uses an in-memory store per server instance and re-bootstraps on first load.
- **Backup demo videos** (plan §23) have to be recorded on your machine.

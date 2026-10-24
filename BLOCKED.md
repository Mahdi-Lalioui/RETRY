# Remaining live-demo requirements — verified 24 October 2026

- **Inference works.** The supplied OpenAI credential authenticated, and the supplied Mubit key successfully routed real `gpt-4o-mini` calls. `/api/agent/step` returned HTTP 200, valid JSON action and a Mubit `mreq_` request ID. Credentials are local in ignored `.env.local`.
- **Open-model access is missing.** The Mubit project returned HTTP 403 `provider_key_missing` for both Groq and OpenRouter. `OPEN_BASE_MODEL` remains unset; `open-base` is a mock placeholder. Configure a provider/model actually served by the chosen Mubit endpoint before live Base/RETRY/ICL runs.
- **The live learning loop needs a confirmed integration.** Public docs describe automatic adapter training and console comparisons, but explicitly do not support calling an adapter by its model ID. Correction submission, explicit refresh, version tracking and adapter serving contracts in the original plan are not verified APIs. Obtain the event-specific contract from Mubit; keep the full demo in clearly labelled mock mode until it is available. Missing configuration now fails explicitly.
- **Persistence/deployment:** no Neon database or Vercel account was configured in this checkout. Memory storage is per process; add DATABASE_URL and run db:push before relying on cross-instance durable data.
- **Stage preparation:** rehearse the timed script and record real 3-minute/90-second backups once live integration is available. The checked-in replay is honestly labelled as a simulator recording.

Evidence and commands: [VERIFICATION.md](VERIFICATION.md).

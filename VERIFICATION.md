# RETRY verification — 24 October 2026

The original build plan is a product target. This document records what was actually checked and separates simulated rehearsal from live provider behavior.

## Changes

- Evaluation infrastructure failures remain failed trials in the denominator, and any such error blocks promotion. Missing/invalid metrics, incomplete coverage and missing baselines also fail closed.
- A bug report earns credit only after its evidence appears in the shop. An injected flag on the home page is not a detected bug.
- Versions are evaluated under their canonical identity. Only seeded v1 is the base model. Zero-example adapters, mismatched eval lanes, stale remote versions and manual activation cannot bypass the promotion gate.
- Real refresh snapshots submitted corrections. Failed, queued or subsequently delivered examples are not falsely marked trained. Unaddressable adapter versions produce clear errors.
- Stop/restart cancels stale client work and iframe animations. Replay restores live version/training state when it ends and retains scripted correction labels.
- Rescue queues propagate the task's shipping policy, abort on Stop/unmount, support select values and keep failed submissions retryable.
- Correction acknowledgments mean queued; delivery and training status are reconciled from storage rather than inferred from an animation or promotion.
- API boundaries validate shop state, task identifiers and required action arguments. Model selection comes from server configuration instead of browser-bundled defaults or arbitrary request models.
- CLI scripts load the ignored local environment. Inference-only verification can be run without pretending that undocumented training APIs exist.
- Removed lint warnings and an external fallback-font dependency from the social image.

## Live checks performed

- OpenAI `GET /v1/models`: HTTP 200; configured baseline available.
- Mubit `GET /openai/v1/models`: HTTP 200 and Mubit request ID.
- `npm run smoke:mubit -- --require-real --inference-only --lane closed`: real `gpt-4o-mini` action, parsed successfully, about 1.8 seconds, tracked by `mreq_…`.
- Direct `/api/agent/step` handler with a real shop snapshot: HTTP 200, `parseOk: true`, tracked real Mubit call, about 1.6 seconds. A deliberately incorrect browser model ID was replaced by server configuration.
- Groq/OpenRouter model lists through Mubit: HTTP 403 `provider_key_missing`. No usable open-provider credential is configured in this account.
- Real credentials are stored only in ignored `.env.local`, with owner-only permissions. They are not part of the push.

## Local verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
MUBIT_ENABLED=false MOCK_LATENCY_SCALE=0 MOCK_TRAIN_SECONDS=0 npm start
```

Final checks: **290 tests passed across 19 test files**, lint and typecheck passed without warnings, and the optimized production build succeeded.

The regression suite covers shop determinism/task completion/oracle behavior, parsing, augmentation, mock learning, real-client HTTP serialization, APIs, held-out evaluation and gates, cancellation, iframe messages, replay isolation and delivery failures. An additional exhaustive ideal-policy sweep completed all 12 tasks on 200 seeds at layouts 1 and 6: 4,800 runs, each within the 16-action budget.

Production HTTP smoke checks returned 200 for Mission Control, Lab, Corrections, Attract, the shop, health, held-out metrics and the default recording. Browser rehearsal uses explicitly labelled mock mode; its scores are simulated, not claims about learned real adapters.

## What is still needed for the live hackathon story

1. Configure a served open model and its provider access through Mubit. `open-base` is a mock placeholder, not a real model ID.
2. Obtain event-specific correction, refresh, version tracking and adapter-serving contracts from the Mubit team. The public API [keeps provider model IDs](https://docs.mubit.ai/guides/model-ids) and explicitly does not serve adapters by naming them as models. Public [adapter training/comparison](https://docs.mubit.ai/guides/first-adapter) is console-managed. Custom confirmed integrations remain configurable; no guessed endpoints were added.
3. Add Neon (`DATABASE_URL`) for durable shared data. Memory storage is process-local and cannot preserve corrections across Vercel instances/restarts.
4. Deploy/rehearse the live configuration and record timed backups. This verification pass pushes source changes; it does not provision Vercel or Neon.

The complete rescue → augmentation → mock training → held-out evaluation → gated promotion → replay flow is available for honest rehearsal with `MUBIT_ENABLED=false`. It should not be presented as a proven real adapter-learning loop until the missing integration is supplied.

Official inference contract: [Mubit API reference](https://docs.mubit.ai/reference/api).

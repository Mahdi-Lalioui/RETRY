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

## Live training traffic and authenticated console evidence

The authenticated Mubit workspace shows `adapters.train=true`, automatic approval once tests pass, and automatic serving/rollout configured. Its configured adapter base-model list includes `Qwen/Qwen3-4B-Instruct-2507` and `Qwen/Qwen3-8B`. This establishes a managed automatic path, not direct access to either model or proof that this task already has a serving adapter.

The RETRY QA task is `ln_59528eba80467078eac9bba6`, task key `lk1_b13b77178816b887be7542bc756eca91`. At **11:55 London, 24 October 2026**, Details showed 311 calls, 250 usable calls, 1 kept example, 1 rejected and 248 waiting. Review today showed 200 queued, 50 over limit and 11 running. History showed 197 new calls and 1 sent for review. First training had not started; Routes was empty. The first-training threshold is **25 kept examples**. These console counters cover the task, not just the batch below, and public docs do not specify a review-worker cadence.

A bounded batch sent **60 real gateway chat calls requesting `gpt-4o-mini` through the existing Mubit client**, on varied scripted shop checkpoints. All 60 responses parsed as valid action JSON. The CLI labels this source `scripted-state-real-gateway-output` and records `requestedModel`, because the requested model does not prove actual serving identity. The console showed provider serving during that batch. These are scripted inputs with real gateway outputs, not human corrections. Valid JSON does not establish correct policy, reviewer acceptance, training completion, promotion or adapter serving. Gateway traffic totals must not be substituted for kept-example counts.

That batch used the earlier system prompt. Subsequent instruction changes can form a new Mubit task, so the task ID and counters above describe that observed task rather than every future app or CLI request. A separate one-call smoke check of the new CLI completed successfully in about 1.3 seconds; it does not establish another 60-call batch or adapter training.

```bash
npm run train:live -- --examples 60 --output work/training-evidence.json
```

The CLI sends actual, billable gateway traffic, supports 1–200 examples, caps concurrency at 3, and stops submitting batches after 3 provider errors. It reserves the output path before sending and refuses to overwrite existing evidence. The generator uses disjoint training seeds and distinct first user messages for session separation. It records gateway responses, request IDs, usage and parse outcomes, and never calls fabricated feedback, refresh or version endpoints.

`MUBIT_SUPPORTS_METADATA=true` returned HTTP 400 on the OpenAI route unless provider storage was enabled. Keep it false in the verified configuration; no provider storage setting was changed. Mubit documents a fallback session derived from instructions and the first user message, which the generator varies while keeping the system instructions stable. See [Tasks and sessions](https://docs.mubit.ai/guides/tasks-and-sessions).

The installed `@mubit-ai/sdk@0.13.2` exposes memory, outcomes and prompt/skill optimization; it has no adapter-training or direct adapter-pinning API. Its `/v2/control/feedback` is handoff feedback, not a verified human preference-training contract. Public docs prohibit selecting an adapter by model ID, but this does not rule out the automatic transparent routing shown in the workspace. Actual per-request serving identity must be checked in the console's **Served by** field; the requested model ID alone does not establish it. See [Model IDs](https://docs.mubit.ai/guides/model-ids) and [Requests](https://docs.mubit.ai/guides/requests).

## Local verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
MUBIT_ENABLED=false MOCK_LATENCY_SCALE=0 MOCK_TRAIN_SECONDS=0 npm start
```

Current combined verification: **300 tests passed across 20 test files**, typecheck and lint passed without warnings, and the optimized production build succeeded. The earlier 290-test pass preceded the live-traffic CLI.

The regression suite covers shop determinism/task completion/oracle behavior, parsing, augmentation, mock learning, real-client HTTP serialization, APIs, held-out evaluation and gates, cancellation, iframe messages, replay isolation and delivery failures. An additional exhaustive ideal-policy sweep completed all 12 tasks on 200 seeds at layouts 1 and 6: 4,800 runs, each within the 16-action budget.

Production HTTP smoke checks returned 200 for Mission Control, Lab, Corrections, Attract, the shop, health, held-out metrics and the default recording. Browser rehearsal uses explicitly labelled mock mode; its scores are simulated, not claims about learned real adapters.

## What is still needed for the live hackathon story

1. Let Mubit review the task's recorded calls and reach its kept-example threshold; verify actual training, tests, promotion and routing. No adapter has yet been observed serving this task. Automatic managed training may remove the need for a separate external open-provider account for adapters, but `open-base` is still a placeholder and Groq/OpenRouter baselines remain unavailable.
2. Confirm correction submission and exact baseline/served-version identities for fair lane comparisons. The public API [keeps provider model IDs](https://docs.mubit.ai/guides/model-ids) and does not let callers pin an adapter by naming it as a model; transparent automatic routing is a separate, enabled workspace capability. The local held-out gate cannot claim to evaluate one specific adapter when serving identity is unknown. No guessed feedback or refresh endpoints were added.
3. Add Neon (`DATABASE_URL`) for durable shared data. Memory storage is process-local and cannot preserve corrections across Vercel instances/restarts.
4. Deploy/rehearse the live configuration and record timed backups. This verification pass pushes source changes; it does not provision Vercel or Neon.

The complete rescue → augmentation → mock training → held-out evaluation → gated promotion → replay flow is available for honest rehearsal with `MUBIT_ENABLED=false`. Real traffic capture and configured automatic training are verified separately; the complete live correction-to-serving app loop is not yet proven.

Official inference contract: [Mubit API reference](https://docs.mubit.ai/reference/api).

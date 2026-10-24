# RETRY

**The AI QA tester that learns your team's testing rules from every human rescue.** Built for Night Shift: Mubit Hackathon, London.

**Verified 24 October 2026:** real gateway calls requesting `gpt-4o-mini` work, including 60 valid JSON actions on varied scripted shop checkpoints. The authenticated workspace has adapter training and automatic promotion/rollout enabled. At the 11:55 London snapshot, the QA task had 1 kept example out of 25, review work pending, no training started and no active route. The complete rescue → refresh → promotion demo is verified in **labelled mock mode**; its live counterpart is not complete. See [VERIFICATION.md](VERIFICATION.md) for evidence and remaining limits.

> RETRY captures the rules behind a human rescue, routes model calls through Mubit, and tests updates against unseen shop layouts and real bug cases. Live adapter training and routing depend on Mubit's acceptance and promotion gates.

## The problem
Every QA team has house rules no model knows: decline the protection-plan upsell, use the internal test coupon, use collect-in-store for UK test orders, never press "Pay with saved card". AI testers get stuck on these, a human rescues them, and on the next run they get stuck again. The rescue is wasted.

## How RETRY works
1. **Every decision goes through Mubit.** Each test step is one model call: "given this page, what's the next action?" All calls go through `lib/mubit/client.ts`, and nothing else imports a model SDK.
2. **A rescue becomes training data.** When the agent breaks a rule or gets stuck, a human clicks the right element. That becomes a correction for that exact call, and it is re-rendered across 8 other site layouts. Those are labelled `augmented`.
3. **A versioned update.** Mock mode exercises correction delivery and version creation. Live Mubit automatically reviews recorded calls and trains eligible adapters from kept examples; the human-correction submission contract is not verified. A completed chat is not evidence that a correction was accepted or a model was trained.
4. **It must pass held-out tests to be promoted.** RETRY's local gate runs 48 tests, 16 with injected bugs, and blocks promotion if success or bug detection regresses. This works in mock rehearsal. Fair live adapter evaluation still needs confirmed baseline and served-version identities; Mubit's managed promotion and rollout are separate from this app's local gate.

## What you'll see
- **Mission Control (`/`)** runs three lanes side by side: GPT (closed), the base open model, and RETRY (the adapted open model). Each one drives a live checkout in our demo shop, NIGHT MARKET. You also see the Mubit pipe, rescues, the training ring, version promotion, and a held-out scoreboard with a learning curve.
- **`/lab`** has the version timeline, a held-out matrix, the learning curve, ICL (corrections stuffed into the prompt) vs adapter, and a JSONL export.
- **`/corrections`** is the correction ledger, with delivery/training status and each source labelled `human`, `scripted` or `augmented`. A queued correction has not necessarily been sent or trained.
- **`/attract`** is a self-running expo loop on unseen layouts.

Hotkeys: `R` run · `J` judge's turn (an unseen seed, sometimes with a bug) · `S` ship a new site version · `B` break checkout · `H` heal · `T` train now · `I` ICL lane · `D` replay · `?` how Mubit is used.

## Honesty
- Base and adapted lane system prompts say only "Follow house test policy." The optional ICL lane explicitly includes stored correction examples.
- Training seeds (1–200), held-out seeds (9000–9047) and judge seeds (≥10000) don't overlap, and the code enforces it.
- Scripted backlog rescues are labelled `scripted`, augmented examples `augmented`, and replays `replay`.
- Live training traffic is labelled `scripted-state-real-gateway-output`: the shop states are scripted and the answers come from real Mubit gateway calls. The requested model is recorded separately from actual serving identity. These calls are not human rescues, kept-example counts, or evidence of trained adapters.
- In **MOCK MODE** (yellow pill), a deterministic mock stands in for Mubit. It learns only from rules that actually appear in stored corrections.

## Architecture
Next.js 15 (App Router, TypeScript) on Vercel.
- **Shop engine:** a pure state machine in `lib/shop`, shared by the visible iframe shop and the server-side eval simulator, so both behave identically.
- **Agent:** `lib/agent` (prompt, parse, policy, stuck detection, client loop, simulator).
- **Mubit:** `lib/mubit` (real client, mock, memory fallback).
- **Training and eval:** `lib/train` (augmentation, backlog) and `lib/eval` (suite, runner, metrics, gate).
- **Storage:** Drizzle and Neon, with an in-memory fallback.

See `plan.md` for the full spec.

## Run it
```bash
npm ci
cp .env.example .env.local   # fill in keys; leave MUBIT_ENABLED=false for mock mode
npm run dev                  # http://localhost:3000
npm test                     # regression suite
npm run smoke:mubit          # checks the configured Mubit endpoints
npm run reset:demo           # with DATABASE_URL: roll the shared DB back to v4 / 0 rescues before each demo
```
To deploy and to switch to real Mubit, see `MORNING.md`.

For a live inference check that does not assume a training API:
```bash
npm run smoke:mubit -- --require-real --inference-only --lane closed
```

To send a bounded batch of real, billable gateway calls for Mubit's automatic training pipeline:

```bash
npm run train:live -- --examples 60 --output work/training-evidence.json
```

This uses the existing real Mubit client and configured requested model. It supports 1–200 examples, caps concurrency at 3, stops submitting batches after 3 provider errors, and refuses to overwrite an evidence file. Inputs use training-pool seeds and distinct first user messages for separate sessions; responses, request IDs, usage and parse results are recorded. It calls no guessed feedback, refresh or named-adapter API. Completion means gateway traffic was sent; inspect the console for review acceptance, training and actual serving.

The recorded 60-call batch used the earlier system prompt. Changed instructions can create a new Mubit task, so identify the task for newly sent calls instead of assuming the earlier task's counts apply.

CLI scripts load `.env.local`, just like Next.js. Keep credentials there, never in source control. Use `MUBIT_ENABLED=false npm run dev` for a full mock rehearsal while retaining your real credentials locally.

Keep `MUBIT_SUPPORTS_METADATA=false` for the verified configuration: enabling metadata returned HTTP 400 on the OpenAI route unless provider storage was enabled. The documented fallback derives a session from the instructions and first user message, so the traffic generator varies that message without changing the system prompt. No provider storage setting was changed.

## Limitations
- The agent reads a semantic text snapshot of our own shop. On real sites, that snapshot would come from an accessibility tree or Playwright.
- [Mubit's public API](https://docs.mubit.ai/reference/api) uses `https://api.mubit.ai/openai/v1`, an `mbt_` key, and `x-middleware-request-id`. Provider keys belong in the Mubit console. Public Mubit rejects forwarded provider credentials.
- The [documented model API](https://docs.mubit.ai/guides/model-ids) does not let callers pin an adapter by naming it as a model. The authenticated workspace does configure transparent automatic serving after training, testing and promotion; the absence of adapter pinning does not mean automatic serving is unavailable. No trained serving adapter has yet been observed for this task. The app still needs confirmed correction delivery and exact baseline/served-version identities for its full live loop and fair lane comparisons.
- `OPEN_BASE_MODEL=open-base` is a mock placeholder. Groq and OpenRouter returned HTTP 403 `provider_key_missing`, so separately requested open-provider baselines remain unavailable. Mubit's managed adapters may use its configured open base models without a separate external open-provider account; that does not supply a verified baseline or pinned adapter for the app's existing lanes.
- Without `DATABASE_URL`, corrections and runs live in process memory. Use Neon for durable shared data on Vercel.

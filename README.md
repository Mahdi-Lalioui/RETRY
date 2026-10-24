# RETRY

**The AI QA tester that learns your team's testing rules from every human rescue.** Built for Night Shift: Mubit Hackathon, London.

> Self-healing tools guess. RETRY learns your rules from every rescue, and still knows a redesign from a real bug. Every call goes through Mubit, and every rescue becomes a model update.

## The problem
Every QA team has house rules no model knows: decline the protection-plan upsell, use the internal test coupon, use collect-in-store for UK test orders, never press "Pay with saved card". AI testers get stuck on these, a human rescues them, and on the next run they get stuck again. The rescue is wasted.

## How RETRY works
1. **Every decision goes through Mubit.** Each test step is one model call: "given this page, what's the next action?" All calls go through `lib/mubit/client.ts`, and nothing else imports a model SDK.
2. **A rescue becomes training data.** When the agent breaks a rule or gets stuck, a human clicks the right element. That becomes a correction for that exact call, and it is re-rendered across 8 other site layouts. Those are labelled `augmented`.
3. **A versioned update.** The corrections are sent to Mubit, which builds a new model version (v2, v3, v4…).
4. **It must pass held-out tests to be promoted.** Each version runs 48 tests on seeds it never trained on, 16 of them with injected bugs. It is promoted only if success doesn't drop and bug detection doesn't regress. Otherwise it is **held back**, and rollback is one click.

## What you'll see
- **Mission Control (`/`)** runs three lanes side by side: GPT (closed), the base open model, and RETRY (the adapted open model). Each one drives a live checkout in our demo shop, NIGHT MARKET. You also see the Mubit pipe, rescues, the training ring, version promotion, and a held-out scoreboard with a learning curve.
- **`/lab`** has the version timeline, a held-out matrix, the learning curve, ICL (corrections stuffed into the prompt) vs adapter, and a JSONL export.
- **`/corrections`** is the ledger of every training pair, exactly as sent to Mubit, with each source labelled `human`, `scripted` or `augmented`.
- **`/attract`** is a self-running expo loop on unseen layouts.

Hotkeys: `R` run · `J` judge's turn (an unseen seed, sometimes with a bug) · `S` ship a new site version · `B` break checkout · `H` heal · `T` train now · `I` ICL lane · `D` replay · `?` how Mubit is used.

## Honesty
- The house rules are **never** in the prompt. It only says "Follow house test policy." Corrections are the only way the rules reach the model.
- Training seeds (1–200), held-out seeds (9000–9047) and judge seeds (≥10000) don't overlap, and the code enforces it.
- Scripted backlog rescues are labelled `scripted`, augmented examples `augmented`, and replays `replay`.
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
npm test                     # 208 tests
npm run smoke:mubit          # checks the configured Mubit endpoints
```
To deploy and to switch to real Mubit, see `MORNING.md`.

## Limitations
- The agent reads a semantic text snapshot of our own shop. On real sites, that snapshot would come from an accessibility tree or Playwright.
- Mubit Middleware's API details were not public. They are env-driven (`TODO(MUBIT)` in `.env.example`).

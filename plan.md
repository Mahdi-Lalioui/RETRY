# RETRY — Build Plan (plan.md)

> **The AI QA tester that learns your team's testing rules from every human rescue.**
> Night Shift: Mubit Hackathon, London. Hacking: Fri 23 Oct 19:30 → Code freeze Sun 25 Oct 10:00.
> Stack: Next.js (App Router, TypeScript) full-stack, deployed on Vercel. All LLM calls routed through Mubit.

This file is the single source of truth. Every Claude Code agent working on this repo MUST read it fully before writing code, and MUST NOT deviate from the contracts in §5 without updating this file first.

---

## Table of contents

0. Read this first (rules for every agent)
1. Product, pitch and why it wins
2. Judging criteria → how each one is won
3. Mubit: what we know, what we don't, what to ask
4. Architecture
5. Shared contracts (types — frozen after H2)
6. Repo setup, dependencies, folder structure
7. The demo shop "NIGHT MARKET"
8. House rules, tasks, mutations, bugs, oracle
9. Snapshot, prompt, parser, agent loop, executor
10. Rescue (human correction) flow
11. Mubit integration layer
12. Training data: augmentation, dataset, splits
13. Evaluation suite, metrics, promotion gate
14. Mission Control UI — full visual spec
15. Other pages (/lab, /corrections, /attract)
16. API routes (contracts)
17. Database schema (Drizzle + Neon)
18. Environment variables
19. Demo mode, recording, fallbacks
20. Deployment on Vercel
21. Multi-agent workstreams + agent prompts
22. Timeline with go/no-go gates
23. Testing and rehearsal checklist
24. Demo script (3:00 and 1:30)
25. Judge Q&A answers
26. Definition of done

---

## 0. Read this first (rules for every agent)

1. **Every LLM call goes through `lib/mubit/client.ts`.** No other file imports `openai` or calls a model. The hackathon rule is "every project must route its LLM calls through Mubit." Breaking this disqualifies us.
2. **No headless browser, no Playwright, no Puppeteer, no vision model, no computer-use.** The agent reads a text snapshot of our own shop. The shop is pure state + React rendering.
3. **The shop logic is a pure state machine** (`lib/shop/*`) shared by the visible React shop and the server-side eval simulator. No DOM access inside `lib/shop/*`.
4. **Determinism:** `temperature: 0`, fixed `seed` where supported, seeded layouts, frozen held-out suite.
5. **Mubit unknowns are `TODO(MUBIT)` placeholders** driven by env vars. Never hard-code a guessed endpoint without the env override.
6. **Honesty on screen.** Augmented examples are labelled "augmented". Replays are labelled "replay". Pre-trained versions show timestamp and example count. Never fake learning.
7. **Design bar is extremely high.** If it isn't beautiful on a projector at 1920×1080, it isn't done.
8. **Small PR-sized commits.** Each workstream works in its own folder. Contract files (`lib/**/types.ts`, `lib/shop/state.ts`) change only via an explicit note in this file.
9. **TypeScript strict. No `any` in contracts.** zod-validate every API input and every model output.

---

## 1. Product, pitch and why it wins

### One-liner
RETRY is an AI QA tester that learns your team's testing rules from every human rescue, keeps up with every redesign, and still catches real bugs.

### The problem
- Every QA team has house rules no model knows: decline the protection-plan upsell, use the internal test coupon, collect-in-store for UK test orders, never press "Pay with saved card", reject non-essential cookies.
- AI testers (self-healing tools) guess. When they get stuck, a human rescues them. Next run, they get stuck again. The rescue is wasted.
- Sites change every release. Selectors break, buttons move, copy changes.

### The solution
- RETRY runs checkout tests as an agent. One model call per step: "given this page, what's the next action?"
- When it breaks a rule or gets stuck, a human clicks the correct element. That rescue becomes a **training example** for that exact decision call.
- Corrections go to **Mubit**, which builds a **versioned model update** (adapter on an open model). The tester gets v2, v3, v4… each evaluated on held-out tests before promotion.
- Result: an open model that knows your rules, is cheaper and faster than GPT, adapts to redesigns, and still reports real regressions.

### Pitch line (say verbatim on stage)
> "Self-healing tools guess. RETRY learns your rules from every rescue — and still knows a redesign from a real bug. Every call through Mubit. Every rescue a model update."

### Why this wins (the marketing angle)
The hackathon is Mubit's marketing. Our demo is a 3-minute Mubit ad that visibly shows: calls routed through Mubit → a correction → a versioned update → measurable improvement on unseen inputs → closed vs open cost/latency. It hits all three tracks at once:
- **Recurring tasks:** next-action decisions in QA runs, thousands per day.
- **Own your intelligence layer:** GPT lane vs adapted open model lane, quality/cost/latency side by side.
- **Fast refresh:** "Ship new version" reshuffles the site live; a new rule (R7) is learned live.

---

## 2. Judging criteria → how each one is won

| Criterion (25% each) | What judges must see | Where in the app |
|---|---|---|
| Use of Mubit | A correction turning into a model update, live | Rescue overlay → correction card flies through Mubit pipe → Training Ring → version badge flips v→v+1 |
| Usefulness | A real recurring task with real cost | QA ticket framing, "rescues needed per 10 runs" metric, competitor gap (Momentic/QA Wolf) |
| Technical execution | It works and survives questions | Held-out suite (48 runs, disjoint seeds, 16 with bugs), promotion gate, /corrections ledger showing exact training pairs, ICL comparison lane |
| Demo | Clear, live, under time, memorable | Mission Control, Judge's turn (judge presses the buttons), BUG REPORTED stamp mic-drop |

---

## 3. Mubit: what we know, what we don't, what to ask

### Confirmed (public)
- Mubit (Reliable AI, Inc.), founders Shankha Dutta & Anil Peri. Host Eldar Utiushev is a serial hackathon winner — expect sharp probing for hard-coding.
- **Mubit Middleware** (middleware.now): "one base URL change", sits in front of your model calls, provides a pool of open models, records whether output was accepted / what needed correction / whether task succeeded, generates lightweight model updates, built for fast refresh. Waitlist product, **no public API docs**.
- Marketing claims: calibration on open-weight models "~2 min to train", updates "versioned and reversible". Their homepage example is literally a checkout-failure agent decision being corrected.
- Mubit's own evaluation language: "Evaluate on held-out tasks with the same model, tools and budgets. Measure verified task success, repeated failures, latency and cost." → **our scoreboard copies this wording.**
- Separate public product: memory SDK `@mubit-ai/sdk` (`remember`, `recall`, `reflect`, `recordOutcome`, step outcomes) on `api.mubit.ai`, env `MUBIT_ENDPOINT`, `MUBIT_API_KEY`. Use only as a fallback signal channel. Do not confuse with Middleware on stage.
- Mubit cares about the "in-context learning vs memory/adapters" debate (CL-Bench). The question "why not put corrections in the prompt?" WILL come. We answer it with a measured ICL lane.

### Unknown — ask at kickoff / office hours, in this order
1. Exact base URL + auth header. Is it OpenAI `chat.completions`-compatible including `response_format: {type:"json_object"}`, `seed`, `temperature`?
2. Which open base models? Context length? JSON reliability? Any multimodal?
3. How do we attach a correction to a specific prior call? Request-ID header name? Feedback payload shape (`preferred_output`, `score`, `accepted:false + correction`)?
4. What triggers an update: N feedback items, automatic change detector, or explicit API/console? Minimum examples? Real wall-clock for ~100–300 examples?
5. How are versions addressed (model string suffix, header, console pin)? Can two versions be served simultaneously (we pin v1 and vN side by side)? Rollback?
6. Can we pass the closed OpenAI baseline through Middleware (passthrough)? Does it need a provider-key header?
7. Rate limits and concurrency (we run 3–4 lanes + eval at concurrency 4).
8. Any per-call cost figure we may display for open models?
9. Any console view of versions/training we can screenshot?
10. "What would you most like to see that no team has shown you yet?"

**Write every answer into §11.5 "Confirmed Mubit facts" of this file the moment you get it.**

---

## 4. Architecture

```
┌──────────────────────── Browser: Mission Control (/) ────────────────────────┐
│  TopBar · MubitPipe (particles) · Lane×3/4 · CorrectionTray · TrainingRing    │
│  Scoreboard · ControlDeck (hotkeys)                                            │
│                                                                                │
│  Lane = <iframe src="/shop/[seed]?lane=X&task=T"> (same origin)               │
│         ├─ shop renders from ShopState (lib/shop)                             │
│         ├─ bridge.ts (inside iframe): postMessage ⇄ parent                     │
│         │     • "snapshot" → returns renderSnapshot(state)                     │
│         │     • "act"      → executor animates + applies action               │
│  LaneController (client, zustand): loop step → POST /api/agent/step          │
└────────────────────────────────────────────────────────────────────────────────┘
                 │ one step = one HTTP call = one Mubit call
┌──────────────────────── Next.js Route Handlers (Vercel, Node) ────────────────┐
│ /api/agent/step         → lib/agent/policy → lib/mubit/client.chat()          │
│ /api/corrections        → store + augment + lib/mubit/client.submitFeedback() │
│ /api/refresh            → client.requestRefresh() (or automatic mode)          │
│ /api/refresh/status     → poll training/version status                         │
│ /api/versions           → list / activate / rollback                           │
│ /api/eval/run           → server-side simulator runs held-out suite (no DOM)   │
│ /api/eval/status        → progress                                             │
│ /api/metrics            → scoreboard aggregates                                │
└────────────────────────────────────────────────────────────────────────────────┘
                 │
        Neon Postgres (Drizzle) — runs, steps, corrections, versions, eval results
        DEMO_MODE fallback — recorded JSON in /public/demo
```

### Key decisions (do not relitigate)
- **Client-driven loop.** Each step is a short serverless call (<10s). No long-running functions, no timeouts.
- **Polling, not SSE.** Vercel SSE is fine but polling at 1s is simpler and bulletproof. Eval/refresh status are polled.
- **Pure shop engine** means the eval simulator and the visible shop behave identically. This is our credibility backbone. Build it first.
- **No react-three-fiber.** SVG/canvas + Framer Motion looks as good with far less risk.

---

## 5. Shared contracts (types — frozen after H2)

### 5.1 `lib/shop/state.ts`
```ts
export type PageId = 'home' | 'product' | 'cart' | 'checkout' | 'confirmation' | 'error';
export type ModalId = 'cookies' | 'upsell' | 'newsletter' | 'giftwrap';
export type ShippingId = 'standard' | 'express' | 'collect';
export type BugId = 'pay_button_dead' | 'total_nan' | 'no_order_id' | 'coupon_500';
export type ElementRole =
  | 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'select' | 'heading' | 'text' | 'dialog';

export interface Product {
  sku: string; name: string; pricePence: number; image: string; blurb: string; tags: string[];
}

export interface AgentElement {
  id: string;            // "e1".."eN", assigned in render order, deterministic per state
  semKey: string;        // stable semantic key, e.g. "upsell.decline", "checkout.pay" (NEVER shown to model)
  role: ElementRole;
  label: string;         // visible text or aria-label
  region: string;        // "header" | "grid" | "product:Aurora Lamp" | "modal:upsell" | "checkout:shipping" ...
  disabled?: boolean;
  value?: string;
  checked?: boolean;
  options?: string[];
}

export interface LayoutConfig {
  seed: number;
  layoutTag: string;                 // "layout-v1".."layout-vN"
  productOrder: string[];            // skus
  ctaCopy: Record<string, string>;   // semKey -> visible label
  cartPosition: 'header' | 'floating';
  iconOnly: string[];                // semKeys rendered icon-only (aria-label only)
  modalsEnabled: ModalId[];
  shippingOrder: ShippingId[];
  buttonOrder: Record<string, string[]>; // region -> semKey order
  decoyContinue: boolean;            // newsletter box contains a "Continue" decoy
  extraRules: ('R7')[];              // rules introduced by later layout versions
}

export interface CartLine { sku: string; qty: number; protection: boolean; giftwrap: boolean }

export interface ShopState {
  layout: LayoutConfig;
  page: PageId;
  currentSku?: string;
  cart: CartLine[];
  openModals: ModalId[];
  cookiesChoice?: 'essential' | 'all';
  newsletterSubscribed: boolean;
  shipping?: ShippingId;
  couponInput: string;
  couponApplied?: string;
  cardInput: string;
  usedSavedCard: boolean;
  bugs: BugId[];
  orderId?: string;
  totalPence?: number;
  errorMessage?: string;
  violations: RuleId[];              // recorded by the engine as they happen
}
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
```

### 5.2 `lib/agent/types.ts`
```ts
export type ActionType = 'click' | 'type' | 'select' | 'scroll' | 'done' | 'report_bug';
export interface AgentAction { type: ActionType; target?: string; value?: string; reason: string }
export type StepResult = 'ok' | 'no_effect' | 'invalid' | 'error';
export type LaneId = 'closed' | 'base' | 'adapted' | 'icl';

export interface ModelRef { kind: 'closed' | 'open'; model: string; versionId?: string; label: string }

export interface HistoryItem { action: AgentAction; result: StepResult }

export interface StepRequest {
  runId: string; lane: LaneId; taskId: string; goal: string;
  snapshot: string; history: HistoryItem[]; modelRef: ModelRef; stepIdx: number;
}
export interface StepResponse {
  stepId: string; action: AgentAction; callId: string | null;
  latencyMs: number; usage: { in: number; out: number }; costUsd: number | null;
  raw: string; parseOk: boolean; promptChars: number;
}

export type RunStatus = 'running' | 'passed' | 'failed' | 'bug_reported' | 'stuck' | 'violation';
export interface Verdict {
  status: RunStatus; correct: boolean;   // correct = matches oracle ground truth
  reason: string; violations: RuleId[];
}

export interface Task { id: string; goal: string; skus: { sku: string; qty: number }[];
  wantsCoupon: boolean; wantsCollect: boolean; rulesExercised: RuleId[] }
```

### 5.3 `lib/mubit/types.ts`
```ts
export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatReq {
  model: string; versionId?: string; messages: Msg[];
  temperature?: number; seed?: number; jsonMode?: boolean;
  metadata?: Record<string, string>; // task:'retry-next-action', lane, runId, stepIdx
}
export interface ChatRes { text: string; callId: string | null; usage: { in: number; out: number }; latencyMs: number }

export interface FeedbackReq {
  callId?: string | null; input: Msg[]; preferredOutput: string; badOutput?: string;
  label: 'correction' | 'accepted' | 'rejected'; score?: number; tags?: string[];
}
export interface ModelVersionInfo {
  versionId: string; label: string; createdAt: string; examples?: number;
  status: 'training' | 'ready' | 'failed'; progress?: number;
}
export interface MubitClient {
  chat(req: ChatReq): Promise<ChatRes>;
  submitFeedback(f: FeedbackReq): Promise<{ feedbackId: string | null }>;
  requestRefresh(): Promise<{ jobId: string | null; mode: 'explicit' | 'automatic' }>;
  refreshStatus(jobId: string | null): Promise<ModelVersionInfo | null>;
  listVersions(): Promise<ModelVersionInfo[]>;
}
```

---

## 6. Repo setup, dependencies, folder structure

### 6.1 Bootstrap
```bash
npx create-next-app@latest retry --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd retry
npx shadcn@latest init        # style: new-york, base color: zinc, CSS variables: yes
npx shadcn@latest add button badge dialog tabs tooltip sheet sonner table progress separator scroll-area kbd
npm i motion zustand zod drizzle-orm @neondatabase/serverless openai recharts lucide-react clsx tailwind-merge nanoid seedrandom geist
npm i -D drizzle-kit vitest @types/seedrandom tsx
```

`package.json` scripts:
```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "db:push": "drizzle-kit push",
  "smoke:mubit": "tsx scripts/smoke-mubit.ts",
  "seed:corrections": "tsx scripts/seed-corrections.ts",
  "eval": "tsx scripts/run-eval.ts",
  "record:demo": "tsx scripts/record-demo.ts"
}
```

### 6.2 Folder structure
```
retry/
├─ app/
│  ├─ layout.tsx                    # Geist fonts, theme, <Toaster/>
│  ├─ globals.css                   # tokens (§14.1)
│  ├─ page.tsx                      # Mission Control
│  ├─ shop/[seed]/page.tsx          # NIGHT MARKET (client component, reads ?lane&task&bugs&layout)
│  ├─ lab/page.tsx
│  ├─ corrections/page.tsx
│  ├─ attract/page.tsx
│  └─ api/
│     ├─ agent/step/route.ts
│     ├─ corrections/route.ts
│     ├─ refresh/route.ts
│     ├─ refresh/status/route.ts
│     ├─ versions/route.ts
│     ├─ versions/activate/route.ts
│     ├─ eval/run/route.ts
│     ├─ eval/status/route.ts
│     ├─ metrics/route.ts
│     └─ health/route.ts
├─ components/
│  ├─ mission/  TopBar, MubitPipe, Lane, LaneHeader, GhostCursor, VerdictStamp, RescueOverlay,
│  │            CorrectionTray, CorrectionCard, TrainingRing, VersionBadge, Scoreboard,
│  │            LearningCurve, ControlDeck, StepLog, BugReportCard, ReplayBanner
│  ├─ shop/     ShopShell, Header, ProductGrid, ProductCard, ProductPage, CartView, CartFloating,
│  │            CookieModal, UpsellModal, NewsletterBox, GiftwrapModal, Checkout, ShippingOptions,
│  │            CouponBox, PaymentForm, Confirmation, ErrorPage, AgentEl (wrapper adding data-agent-id)
│  └─ ui/       shadcn
├─ lib/
│  ├─ shop/     state.ts, catalog.ts, tasks.ts, layout.ts (mutations), bugs.ts, engine.ts (applyAction),
│  │            elements.ts (state → AgentElement[]), snapshot.ts, oracle.ts, rules.ts, bridge.ts
│  ├─ agent/    types.ts, prompt.ts, parse.ts, policy.ts, stuck.ts, loop.ts (client), sim.ts (server)
│  ├─ mubit/    types.ts, config.ts, client.ts, mock.ts, memory-fallback.ts
│  ├─ train/    augment.ts, dataset.ts
│  ├─ eval/     suite.ts, runner.ts, metrics.ts, gate.ts
│  ├─ db/       schema.ts, index.ts, queries.ts
│  ├─ store/    mission.ts (zustand), lanes.ts
│  ├─ pricing.ts
│  └─ utils.ts
├─ scripts/     smoke-mubit.ts, seed-corrections.ts, run-eval.ts, record-demo.ts
├─ public/
│  ├─ products/ (6 product images — generate clean studio shots, or use SVG illustrations)
│  └─ demo/     recorded runs (JSON) for DEMO_MODE
├─ tests/       shop.test.ts, snapshot.test.ts, oracle.test.ts, parse.test.ts, augment.test.ts
├─ drizzle.config.ts
├─ .env.example
└─ plan.md
```

---

## 7. The demo shop "NIGHT MARKET"

### 7.1 Look and feel
- A believable, premium **light-themed** DTC store (contrast with the dark Mission Control, so the iframes clearly read as "a customer's website").
- Font: Inter (or Geist Sans). Background `#FAFAF7`, text `#111`, accent `#1F3D2B` (deep green), rounded 14px cards, soft shadows.
- Logo: wordmark "NIGHT MARKET" with a small crescent moon glyph (original, SVG).
- Rendered at 1280×800 internally, scaled with CSS `transform: scale()` to fit the lane frame so text stays crisp.

### 7.2 Catalogue (`lib/shop/catalog.ts`)
| sku | name | price |
|---|---|---|
| aurora-lamp | Aurora Lamp | £48.00 |
| ember-mug | Ember Mug | £14.00 |
| drift-hoodie | Drift Hoodie | £62.00 |
| tide-bottle | Tide Bottle | £22.00 |
| moss-planter | Moss Planter | £19.00 |
| orbit-clock | Orbit Clock | £35.00 |

### 7.3 Pages and elements (every interactive element carries a `semKey`)
- **Home:** header (logo, search box decorative, cart button `header.cart`), hero, product grid. Each card: `grid.open:<sku>` (title link), `grid.add:<sku>` (add button).
- **Product page:** title, price, qty select `product.qty`, `product.add`, `product.back`.
- **Upsell modal** (on add to cart when enabled): "Protect your purchase?" → `upsell.accept` ("Add Protection Plan (£6)"), `upsell.decline` ("No thanks").
- **Giftwrap modal** (only when layout has R7): `giftwrap.accept`, `giftwrap.decline`.
- **Cookie modal** (on first load when enabled): `cookies.all` ("Accept all"), `cookies.essential` ("Essential only").
- **Newsletter box** (cart page when enabled): email textbox `newsletter.email`, `newsletter.subscribe`, and decoy `newsletter.continue` ("Continue") when `decoyContinue`.
- **Cart:** lines with qty, `cart.checkout`, `cart.continueShopping`.
- **Checkout:** shipping radios `checkout.ship.standard|express|collect`; coupon `checkout.coupon.input` + `checkout.coupon.apply`; card `checkout.card.input`; `checkout.pay.saved` ("Pay with saved card"); `checkout.pay` ("Pay £X").
- **Confirmation:** "Order confirmed", order ID `NM-XXXXXX`, total.
- **Error page:** "Something went wrong (500)".

### 7.4 Rendering rule
React components never hold their own state. They render `ShopState` and dispatch `applyAction`-equivalent events. Human clicks (e.g. when a judge clicks inside the shop directly) go through the same engine. Each interactive element is wrapped in `<AgentEl semKey=... id=...>` which sets `data-agent-id` and `aria-label`.

---

## 8. House rules, tasks, mutations, bugs, oracle

### 8.1 House rules (`lib/shop/rules.ts`) — the reason the base model fails
| id | rule | violation detected when |
|---|---|---|
| R1 | Always decline the Protection Plan upsell | `upsell.accept` clicked |
| R2 | When a task says "test coupon", use `NIGHTSHIFT` | coupon applied ≠ `NIGHTSHIFT` or task completes without it |
| R3 | UK test orders use "Collect in store" | order placed with shipping ≠ `collect` when task `wantsCollect` (only UK test orders: T1, T3, T5, T7, T11 — goal text contains "(UK test order)") |
| R4 | Pay with test card `4242 4242 4242 4242`; never "Pay with saved card" | `checkout.pay.saved` clicked, or card ≠ test card |
| R5 | Cookies: "Essential only", never "Accept all" | `cookies.all` clicked |
| R6 | Ignore the "Continue" button inside the newsletter box | `newsletter.continue` clicked (it subscribes and navigates home — a trap) |
| R7 | Decline gift wrap (introduced live in a later layout version) | `giftwrap.accept` clicked |

The agent's system prompt only says: **"Follow house test policy."** It never lists the rules. This simulates organisation-specific knowledge that only corrections can teach. Be explicit about this on stage if asked.

### 8.2 Tasks (`lib/shop/tasks.ts`) — 12 QA tickets
```
T1  Buy one Aurora Lamp and reach order confirmation.
T2  Buy two Ember Mugs using the test coupon.
T3  Buy a Drift Hoodie for in-store collection.
T4  Buy the cheapest product in the store.
T5  Buy one Tide Bottle and one Moss Planter.
T6  Buy an Orbit Clock using the test coupon.
T7  Buy three Ember Mugs.
T8  Buy the most expensive product using the test coupon.
T9  Buy one Moss Planter and reach order confirmation.
T10 Buy a Drift Hoodie and an Aurora Lamp.
T11 Buy two Tide Bottles using the test coupon.
T12 Buy one of every product under £20.
```
Each task defines expected cart contents; the oracle checks them.

### 8.3 Layout mutation engine (`lib/shop/layout.ts`)
`makeLayout(seed, versionIndex): LayoutConfig` — deterministic via `seedrandom(seed)`:
- Shuffle `productOrder`.
- CTA copy from synonym sets:
  - `grid.add`: ["Add to bag", "Add to cart", "Get it", "Add"]
  - `cart.checkout`: ["Checkout", "Proceed to payment", "Continue to secure checkout", "Go to checkout"]
  - `checkout.pay`: ["Pay £{total}", "Place order", "Complete purchase", "Confirm & pay"]
  - `upsell.decline`: ["No thanks", "Skip", "Continue without protection", "Not now"]
  - `upsell.accept`: ["Add Protection Plan (£6)", "Protect it — £6", "Yes, add cover"]
  - `cookies.essential`: ["Essential only", "Reject non-essential", "Necessary cookies only"]
  - `cookies.all`: ["Accept all", "Allow all cookies", "OK, got it"]
- `cartPosition` header|floating; 30% chance each of 0–2 semKeys icon-only.
- `modalsEnabled`: cookies 70%, upsell 80%, newsletter 60% (always on for some training seeds).
- `shippingOrder` permutation; `buttonOrder` permutations per region (e.g. upsell decline left or right; pay.saved above or below pay).
- `decoyContinue` 60%.
- `extraRules`: `['R7']` when `versionIndex >= REVEAL_R7_AT` (used for live fast-refresh moment) → giftwrap modal appears after upsell.

"Ship new version" in Mission Control = `seed = nextUnseenSeed()`, `versionIndex++`, `layoutTag = layout-v{n}`. All lanes reload the same new layout. Shop transition: Framer Motion `layout` + crossfade 600ms.

### 8.4 Bugs (`lib/shop/bugs.ts`)
| BugId | Effect | Visible evidence |
|---|---|---|
| pay_button_dead | clicking pay does nothing | still on checkout after pay |
| total_nan | total renders "£NaN" after coupon/shipping | "£NaN" text in summary |
| no_order_id | confirmation shows "Order confirmed" but no order number | missing NM- id |
| coupon_500 | applying any coupon → error page | 500 page |

"Break checkout ▾" chooses one; "Heal" clears all.

### 8.5 Engine (`lib/shop/engine.ts`)
`applyAction(state: ShopState, semKey: string, value?: string): { state: ShopState; effect: 'ok' | 'no_effect' }`
- Pure, deterministic. Handles navigation, modal open/close, cart, inputs, coupon validation (`NIGHTSHIFT` = 10% off; other codes → "Invalid code"), payment (test card success; saved card succeeds but records R4 violation), bug effects, violation recording.
- `elements(state): AgentElement[]` builds the ordered element list (modals first when open, then page regions) and assigns ids `e1..eN`.
- `resolveTarget(state, id) → semKey` and `findBySemKey(state, semKey) → id` (used by augmentation).

### 8.6 Oracle (`lib/shop/oracle.ts`)
`judge(task, finalState, finalAction): Verdict`
- If bug active:
  - `report_bug` → correct (`bug_reported`).
  - `done` → incorrect (`failed`, "Passed a broken checkout").
- If no bug:
  - `done` + valid order (orderId present, cart matches task, coupon/shipping/payment per rules, zero violations) → `passed`, correct.
  - `done` + violations → `violation`, incorrect.
  - `report_bug` → incorrect (false alarm).
- Step budget exceeded → `stuck`, incorrect.

---

## 9. Snapshot, prompt, parser, agent loop, executor

### 9.1 Snapshot (`lib/shop/snapshot.ts`)
Compact, deterministic text, target < 1,200 tokens:
```
PAGE checkout | LAYOUT layout-v7 | CART 2 items £28.00
[modal:upsell] e1 heading "Protect your purchase?" | e2 button "Protect it — £6" | e3 button "Not now"
[checkout:shipping] e4 radio "Standard (£3.95)" | e5 radio "Collect in store (free)" checked=false | e6 radio "Express (£9)"
[checkout:coupon] e7 textbox "Coupon code" value="" | e8 button "Apply"
[checkout:payment] e9 textbox "Card number" value="" | e10 button "Pay with saved card" | e11 button "Place order"
[summary] e12 text "Total £28.00"
```
Rules: modals listed first; disabled flagged; icon-only elements use aria-label; never include `semKey`.

### 9.2 Prompt (`lib/agent/prompt.ts`) — identical across lanes except ICL
**System:**
```
You are RETRY, a QA test agent executing an end-to-end test on a web shop.
Each turn you receive the test goal, your recent actions with results, and a snapshot of the current page.
Return ONLY a JSON object: {"type": "...", "target": "...", "value": "...", "reason": "..."}
- type: one of click | type | select | scroll | done | report_bug
- target: an element id from the snapshot (e.g. "e7"). Required for click/type/select.
- value: text to type or option to select. Only for type/select.
- reason: one short sentence.
Use "done" only when the goal is verifiably complete (an order confirmation with an order number is visible).
Use "report_bug" when the site prevents completing the goal or shows invalid data; put the evidence in reason.
Follow house test policy.
```
**User:**
```
GOAL: {goal}
HISTORY (most recent last):
1. click e3 → ok
2. type e7 "SAVE10" → ok
...(last 6)
PAGE SNAPSHOT:
{snapshot}
Next action JSON:
```
**ICL lane only:** append to system: `HOUSE TEST POLICY EXAMPLES (learned from past human corrections):` followed by every stored correction as `situation excerpt → correct action`. This grows with corrections — that's the point of the comparison. Track `promptChars`.

### 9.3 Parser (`lib/agent/parse.ts`)
1. Extract first `{...}` JSON object (handle code fences).
2. zod validate. 3. If `target` missing for click/type/select or not in snapshot ids → one retry with appended user message `Your target "{x}" is not in the snapshot. Choose a valid id.` 4. Second failure → `{type:'scroll', reason:'invalid output'}`, result `invalid`. Count as failure signal.

### 9.4 Policy (`lib/agent/policy.ts`, server)
`nextAction(req: StepRequest): Promise<StepResponse>`: build messages → `mubit.chat({ model, versionId, messages, temperature:0, seed: 7, jsonMode: true, metadata })` → parse → store step in DB → compute cost via `lib/pricing.ts` → return.

### 9.5 Stuck detection (`lib/agent/stuck.ts`)
Stuck if any: same action twice in a row with `no_effect`; 3 `invalid`; step count > `MAX_STEPS` (16); a rule violation just occurred (flash "POLICY VIOLATION R#", then stuck → rescue). In eval mode stuck = failed run (no rescue).

### 9.6 Client loop (`lib/agent/loop.ts`)
```
for stepIdx in 0..MAX_STEPS:
  snapshot = await bridge.request(laneFrame, 'snapshot')
  res = await POST /api/agent/step
  pipe.emit(lane, res.latencyMs)                // particle animation
  if res.action.type in [done, report_bug]: verdict = await POST oracle via /api/agent/step?final… (or client-side oracle on shared state) → stamp → break
  result = await bridge.request(laneFrame, 'act', res.action) // animates ghost cursor then applies
  history.push({action, result}); stuck = detectStuck(...)
  if stuck && mode==='live': open RescueOverlay(lane, step) and await rescue
```
Lanes run concurrently (`Promise.all`), each with its own abort controller. A global "Stop" hotkey aborts all.

### 9.7 Executor + bridge (`lib/shop/bridge.ts`, inside iframe)
- Listens to `postMessage` from parent (check `event.origin === location.origin`).
- `snapshot` → `renderSnapshot(state)` + element rects map.
- `act` → find `[data-agent-id=target]`, scroll into view, post `{cursorTo:{x,y}}` to parent (coordinates converted to parent space using frame scale), wait 380ms (cursor travel), show press ripple, then apply engine action, wait 2 rAF, reply `{result, layoutTag}`.
- `type` actions animate characters at 25ms each.
- `scroll` scrolls the shop 400px.

---

## 10. Rescue (human correction) flow

1. Lane is stuck → lane dims (40% opacity overlay), amber pulsing border, banner: **"RESCUE NEEDED — show RETRY the right move"**.
2. Hovering inside the shop highlights elements with amber outline + label chip ("e3 · button · Not now").
3. Human clicks element. For textboxes, a small inline input appears to enter the value. For select, an option picker.
4. Optional rule chip row: R1…R7 + "Other" (free text). Defaults to the auto-detected violated rule if any.
5. Submit (Enter): 
   - `POST /api/corrections { stepId, goodAction, rule }`.
   - Server: stores human correction (source `human`), runs augmentation (§12) → 8 augmented examples, submits all to Mubit as feedback (background, `after()` from `next/server` so response is instant), updates statuses.
   - Client: **CorrectionCard animation** — card lifts from the lane (scale 0.6→1), shows bad → good diff (red strikethrough `click e2 "Protect it — £6"` → green `click e3 "Not now"`), badge "R1 · ×8 augmented", then travels along the Mubit pipe (amber) into the core, then lands in the Correction Tray.
   - The good action executes in the shop; the run continues.
6. Tray counter increments ("47 rescues · 423 examples"). When `queuedSinceLastVersion >= REFRESH_MIN_EXAMPLES`, the Training Ring shows "Ready to refresh" glow; `T` triggers.

---

## 11. Mubit integration layer

### 11.1 `lib/mubit/config.ts`
Reads env (§18); exports `MUBIT_ENABLED`, base URL, keys, URLs, `VERSION_MODE`, model ids. Throws a clear error on boot if `DEMO_MODE=false` and `MUBIT_BASE_URL` missing.

### 11.2 `lib/mubit/client.ts` (real)
```ts
import OpenAI from 'openai';
const oai = new OpenAI({ baseURL: cfg.baseUrl, apiKey: cfg.apiKey,
  defaultHeaders: cfg.providerKeyHeader ? { [cfg.providerKeyHeader]: process.env.OPENAI_API_KEY! } : undefined });

async function chat(req: ChatReq): Promise<ChatRes> {
  const model = resolveModel(req.model, req.versionId);           // VERSION_MODE=model_suffix → `${model}@${versionId}` TODO(MUBIT) exact syntax
  const headers = versionHeaders(req.versionId);                   // VERSION_MODE=header → { [cfg.versionHeader]: versionId }
  const t0 = performance.now();
  const { data, response } = await oai.chat.completions.create({
    model, messages: req.messages, temperature: req.temperature ?? 0, seed: req.seed,
    response_format: req.jsonMode && cfg.supportsJsonMode ? { type: 'json_object' } : undefined,
    metadata: cfg.supportsMetadata ? req.metadata : undefined,
  }, { headers }).withResponse();
  return { text: data.choices[0]?.message?.content ?? '',
    callId: response.headers.get(cfg.requestIdHeader) ?? data.id ?? null,   // TODO(MUBIT) header name
    usage: { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 },
    latencyMs: Math.round(performance.now() - t0) };
}
```
- `submitFeedback`: `fetch(cfg.feedbackUrl, POST, JSON)` with body mapped by `cfg.feedbackShape` adapter function (one place to edit after kickoff). Always include full `input` messages + `preferredOutput` (good action JSON) so examples are self-contained even if call linking isn't supported. Retries 2× with backoff; failures marked `status='failed'` and shown in red in the tray.
- `requestRefresh`: if `cfg.refreshUrl` set → POST, return jobId (`mode:'explicit'`); else `{jobId:null, mode:'automatic'}`.
- `refreshStatus`/`listVersions`: `cfg.versionsUrl` GET, mapped by adapter. If unavailable, versions are tracked in our DB with `mubitVersionId` entered manually via `/lab` admin field (last resort, labelled).
- Every call wrapped in a timeout (20s chat, 10s others) and structured logging (`[mubit] chat lane=adapted 812ms 640/38 tok`).

### 11.3 `lib/mubit/mock.ts` (dev + rehearsal only)
Deterministic fake: base lane picks plausible-but-wrong actions on rule moments (accept upsell, accept all cookies, saved card, wrong coupon); adapted lane looks up corrections table by semKey context. Latency simulated (open 300–600ms, closed 900–1600ms). **Mock is never shown on stage as real**; when `MUBIT_ENABLED=false` the TopBar pill reads "MOCK MODE" in yellow.

### 11.4 `lib/mubit/memory-fallback.ts`
If Middleware only learns from outcomes, also send `recordOutcome` / step outcome via `@mubit-ai/sdk` (signal −1 on bad step with `directive_hint` = correction text; +1 on passing runs). Enabled by `MUBIT_MEMORY_FALLBACK=true`. Do not claim on stage unless used.

### 11.5 Confirmed Mubit facts (fill in during the event)
Discovered offline from `@mubit-ai/sdk@0.13.2` (npm), Fri 23 Oct — NOT yet confirmed with Mubit team:
- Memory/control plane: `https://api.mubit.ai`, HTTP routes `/v2/control/*` (e.g. `/v2/control/outcome`, `/v2/control/step_outcome`, `/v2/control/feedback`, `/v2/control/prompt/versions`, `/v2/control/prompt/optimize`), auth `Authorization: Bearer <MUBIT_API_KEY>`.
- SDK also wraps OpenAI clients (`@mubit-ai/sdk/learn`), and has versioned prompts/skills with activate/diff (candidate → active).
- Our key prefix is `mbt_mw-app_…` ("mw" = Middleware app key). Middleware base URL still unknown → keep env-driven.
- Build sandbox had no network to api.mubit.ai / api.openai.com, so everything was built and tested on the mock client.

```
Base URL:                 
Auth header:              
Open models offered:      
JSON mode supported:      
Request-id header:        
Feedback endpoint/shape:  
Refresh trigger:          
Min examples / train time:
Version addressing:       
Passthrough for OpenAI:   
Rate limits:              
```

---

## 12. Training data: augmentation, dataset, splits

### 12.1 Augmentation (`lib/train/augment.ts`)
One human rescue → 8 augmented examples:
1. Take the stuck step's `ShopState` and the correct action's `semKey`.
2. For 8 training seeds (from pool 1–200, not already used for this correction), rebuild an equivalent state under that layout (same page, same cart, same open modals, same inputs), render snapshot, find the element with the same `semKey` → new id + new label.
3. Build the exact same prompt the policy would build (same history shape, ids remapped) and `preferredOutput = JSON.stringify({type, target:newId, value, reason})`.
4. Store with `source:'augmented'`, `parentId`.
Honest framing: "the same human decision re-rendered on different layouts".

### 12.2 Dataset rules
- **≥25% of examples must be `report_bug`** on broken states (seeded by rescuing bug runs). Without these the adapter learns "always push to done".
- Include positive examples too: when a run passes, optionally send its steps as `label:'accepted'` (if Mubit supports it) — config `SEND_ACCEPTED=true`.
- Splits: **training seeds 1–200**, **held-out eval seeds 9000–9047**, **judge's turn seeds ≥ 10000**. Enforced in `lib/eval/suite.ts` with an assertion.

### 12.3 Overnight backlog (`scripts/seed-corrections.ts` + humans)
Target by Sat 23:30: **≥40 human rescues** covering R1–R6 and all 4 bug types (≥10 bug rescues) → **≥360 examples**. Use the `/corrections` page "Rescue queue" mode: auto-runs base model on training seeds and stops at each stuck point for a human to rescue quickly (target 20s per rescue).

### 12.4 Live demo correction
Hold back **R7 (gift wrap)** from all training. On stage: Ship new version reveals R7 → adapted lane accepts gift wrap → violation → rescue → refresh → v+1 handles it. If live refresh is too slow, the pre-trained v+1 with R7 (trained during rehearsal, timestamp shown) is used while the live one finishes.

---

## 13. Evaluation suite, metrics, promotion gate

### 13.1 Suite (`lib/eval/suite.ts`)
48 runs = 12 tasks × 4 held-out seeds (9000–9047). 16 of them have a bug injected (deterministic choice). Same suite for every version and every lane.

### 13.2 Runner (`lib/eval/runner.ts`, server, no DOM)
Uses `lib/shop/engine` + `lib/agent/policy` directly (`sim.ts`). Concurrency `EVAL_CONCURRENCY` (4). Each run ≤ 16 steps. Persist runs + steps. `/api/eval/run` kicks it off with `after()` and chunks work across multiple invocations if needed (process 8 runs per invocation, client polls `/api/eval/status` which advances the next chunk) to stay well under function time limits.

### 13.3 Metrics (`lib/eval/metrics.ts`) — wording mirrors Mubit's
- **Verified task success** (healthy runs passed / healthy runs).
- **Bug recall** (bug runs reported / bug runs). **False alarms** (healthy runs reported as bug).
- **Policy violations / run.**
- **Rescues needed per 10 runs** (live) — Mubit's "repeated failures".
- **Steps / run**, **p50/p95 latency per step**, **cost per run** (closed: tokens × `lib/pricing.ts`, source URL noted; open: Mubit figure if provided else "credits").
- **Prompt size** (avg chars) — exposes ICL growth.
- **Learning curve:** verified success vs cumulative corrections across versions.

### 13.4 Promotion gate (`lib/eval/gate.ts`)
New version promoted to the Adapted lane only if `success >= prev.success` AND `bugRecall >= prev.bugRecall - 0.0` AND `falseAlarms <= prev.falseAlarms + 1`. Otherwise badge shows **"HELD BACK — regression on bug detection"** (red outline) and the previous version stays. Rollback button in /lab.

---

## 14. Mission Control UI — full visual spec

### 14.1 Design tokens (`app/globals.css`)
```css
:root {
  --bg: #07080B;  --grid: #11141A;  --panel: #0D1016;  --panel-2: #12161E;
  --border: #1C222C;  --text: #E8EDF5;  --muted: #7A8597;  --faint: #3A4352;
  --mubit: #FF4500;      /* Mubit core + pipe (their brand orange) */
  --learn: #22D3EE;      /* adapted lane / learning */
  --base: #A78BFA;       /* base open model lane */
  --closed: #94A3B8;     /* GPT lane */
  --icl: #F472B6;        /* ICL lane */
  --pass: #34D399;  --fail: #F43F5E;  --rescue: #F59E0B;
  --radius: 12px;
}
body { background: var(--bg); color: var(--text);
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 32px 32px; }
body::after { /* vignette */ content:''; position:fixed; inset:0; pointer-events:none;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.6)); }
```
Typography: Geist Sans (UI), Geist Mono (numbers, ids, logs, actions). `font-variant-numeric: tabular-nums` on all numbers. Base size 14px, scoreboard numbers 28–40px.

Panels: `background: var(--panel); border:1px solid var(--border); border-radius: var(--radius); box-shadow: inset 0 1px 0 #ffffff08, 0 20px 60px -30px #000;`

Motion: Framer Motion springs `{ type:'spring', stiffness:260, damping:26 }`. Nothing pulses faster than 1Hz except particles. Respect `prefers-reduced-motion`.

### 14.2 Layout (designed at 1920×1080, must work at 1280×720)
```
┌──────────────────────────────────── TopBar 56px ─────────────────────────────────────┐
│ ◉ RETRY  [NIGHT SHIFT]   T2 · Buy two Ember Mugs using the test coupon   layout-v7   │
│                                        ● routed via Mubit · 3 lanes    02:41:07       │
├──────────────────────────────────── MubitPipe 88px ──────────────────────────────────┤
│   closed ·····●·····╲                                     ╱·····●····· adapted        │
│                      ⬡  MUBIT  (breathing orange hexagon)                             │
│   base   ·····●·····╱                                                                  │
├──────── Lane: GPT ────────┬──────── Lane: Base v1 ────────┬──── Lane: RETRY v4 ───────┤
│ LaneHeader                │ LaneHeader                     │ LaneHeader               │
│ [ iframe shop 16:10 ]     │ [ iframe shop 16:10 ]          │ [ iframe shop 16:10 ]    │
│ StepLog (last 3, mono)    │ StepLog                        │ StepLog                  │
├──── CorrectionTray ───────┴──────── TrainingRing ─────────┴──── Scoreboard ───────────┤
└──────────────────────── ControlDeck (floating glass bar, bottom center) ──────────────┘
```
Optional 4th lane (ICL) toggled with `I`; lanes reflow to 4 columns.

### 14.3 Components
**TopBar** — wordmark "RETRY" (Geist Sans 700, letter-spacing −0.02em) with a small circular-arrow glyph; amber "NIGHT SHIFT" tag; current task ticket in a pill; `layoutTag` chip that flashes cyan on change; Mubit pill (green dot + "routed via Mubit · N lanes"; yellow "MOCK MODE"; red "MUBIT UNREACHABLE"); live clock.

**MubitPipe** — SVG, full width. Each lane has a curved conduit (2px stroke, lane colour at 30% opacity) converging into a central hexagon (Mubit core, 56px, `--mubit` glow, `filter: drop-shadow(0 0 18px #FF450088)`, breathing scale 1→1.04 at 0.5Hz). On every step: particle (6px circle, lane colour, glow) travels lane→core (duration = `latencyMs/2`, clamped 250–1500ms), core flashes, particle returns core→lane. Correction cards travel the same path in amber as a small rounded rect. Counter under core: "1,284 calls routed".

**Lane** — frame with 1px border in lane colour at 40%; when running, animated conic-gradient border sweep (2s). Contains `LaneHeader`, iframe container (scaled), `GhostCursor` overlay, `VerdictStamp`, `RescueOverlay`, `StepLog`.

**LaneHeader** — left: model name ("GPT · closed", "Base · open v1", "RETRY · open v4") + `VersionBadge`; right: mini stats in mono: `steps 7 · 612ms · $0.0041`. Below: current action line, e.g. `click e3 "Not now"` with reason in muted text, typewriter in at 20ms/char.

**GhostCursor** — SVG arrow (16px) in lane colour with white 1px outline, trail of 6 fading dots, spring movement (stiffness 180, damping 22). Click: ripple ring 0→28px, opacity 1→0, 400ms. Typing: caret blink at element.

**VerdictStamp** — big rotated (−6°) stamp over the lane, scale 1.4→1 spring + slight shake:
- PASS (green) · STUCK (amber) · POLICY VIOLATION R1 (red outline) · BUG REPORTED (red fill) with evidence quote below ("Total shows £NaN after coupon") · FAILED — PASSED A BROKEN CHECKOUT (red).
Lane border glows the verdict colour for 1.2s.

**RescueOverlay** — see §10. Amber, with keyboard hint "Click the right element · Enter to teach · Esc to skip".

**CorrectionCard** — 280×96, panel-2 background, amber left border. Row 1: rule chip `R1 · Decline protection` + source badge (`human` / `×8 augmented`). Row 2 (mono): `- click e2 "Protect it — £6"` red strikethrough; `+ click e3 "Not now"` green. Row 3: status dot: queued (amber pulse) → sent (orange) → in v4 (cyan check).

**CorrectionTray** — vertical stack of last 5 cards (newest on top, spring in), header counter "47 rescues · 423 examples · 31 since v4". Link "Open ledger →" to /corrections.

**TrainingRing** — 180px SVG ring: track `--faint`, progress stroke `--learn` with glow, rounded caps. Center: current version label "v4" (40px mono) and status text: "Collecting · 31/40", "Ready to refresh" (glow), "Mubit building update…" (progress; real if Mubit gives it, else elapsed vs expected labelled "est."), "Evaluating on 48 held-out runs…" (second inner ring), "Promoted ✓" or "Held back ✕". Below: "trained on 423 examples · 2m 04s".

**VersionBadge** — pill `v4`. On promotion: 3D flip (rotateY 0→180°, 700ms, perspective 600px), back face shows new version, cyan burst particles (12, radial, 500ms). Lane header gets a brief cyan sweep.

**Scoreboard** — table, columns = lanes (GPT · Base v1 · RETRY vN · ICL), rows:
`Verified success` · `Bug recall` · `False alarms` · `Policy violations/run` · `Rescues /10 runs` · `p50 latency/step` · `Cost/run` · `Prompt size`.
Best value per row in cyan. Values count up (600ms). Delta arrows vs previous version. Scope toggle: `Held-out (48)` / `Live`. Under it: **LearningCurve** (Recharts line, x = cumulative corrections, y = verified success, one dot per version, cyan line; grey dashed for base; pink for ICL) — this is the most persuasive visual; make it big in /lab and compact here.

**ControlDeck** — floating bottom-center glass bar (`backdrop-blur-xl`, `bg-white/5`, border `#ffffff14`), buttons with `<Kbd>` hints:
`▶ Run all (R)` · `🎲 Judge's turn (J)` · `⇪ Ship new version (S)` · `✕ Break checkout (B ▾)` · `✚ Heal (H)` · `⟳ Train now (T)` · `⊕ ICL lane (I)` · `⏸ Stop (Esc)` · `◐ Demo mode (D)` · task picker.
Judge's turn = random unseen seed ≥10000 + random task + 30% bug chance, then auto-runs.

**StepLog** — last 3 steps in mono, 12px, muted; newest highlights in lane colour.

**BugReportCard** — appears under a lane on `report_bug`: red panel with title "Regression detected", evidence (agent reason), page, layoutTag, "Steps to reproduce" (auto from history). Looks like a real ticket. Optional "Copy as Linear/GitHub issue" button.

**ReplayBanner** — when DEMO_MODE: thin orange bar under TopBar "Replay of run recorded Sun 08:42 · real timings".

### 14.4 Sound (optional, off by default, `M` to toggle)
Soft tick on particle arrival, low "thunk" on stamp, rising chime on version flip. Small `<audio>` files in /public/sfx.

---

## 15. Other pages

**/lab** — tabs:
- *Versions:* timeline of versions (label, examples, trained at, eval metrics, status, Promote/Rollback buttons).
- *Held-out matrix:* heatmap tasks × versions (cell = passed/violation/stuck/bug ok), click → run replay with steps.
- *Learning curve:* large chart.
- *ICL vs adapter:* table + chart: success, latency, cost, prompt size vs number of corrections.
- *Admin:* manual Mubit version id entry, re-run eval, export dataset JSONL.

**/corrections** — ledger table (time, rule, source, parent, lane, status, Mubit feedback id). Row click → drawer showing **the exact training pair** (input messages + preferred output) as sent to Mubit. Filters by rule/source/status. "Rescue queue" mode (§12.3).

**/attract** — fullscreen loop for the expo table: every 45s performs judge's turn with captions ("Unseen layout · RETRY v4 vs GPT"), cycles a bug run every third loop. Captions bottom-left, big.

---

## 16. API routes (contracts)

All inputs zod-validated; all responses `{ ok: true, data } | { ok: false, error }`. Runtime `nodejs`, `export const maxDuration = 60`.

| Route | Method | Input | Output |
|---|---|---|---|
| /api/agent/step | POST | StepRequest | StepResponse |
| /api/agent/finish | POST | `{runId, lane, taskId, finalAction, finalStateDigest}` | Verdict (server re-runs oracle on stored state) |
| /api/corrections | POST | `{stepId, goodAction, rule?}` | `{correctionId, augmented}` |
| /api/corrections | GET | `?limit&rule&source` | Correction[] |
| /api/refresh | POST | `{}` | `{jobId, mode}` |
| /api/refresh/status | GET | `?jobId` | `{phase:'collecting'|'training'|'evaluating'|'promoted'|'held_back', progress, version?}` |
| /api/versions | GET | — | ModelVersion[] |
| /api/versions/activate | POST | `{versionId}` | `{ok}` |
| /api/eval/run | POST | `{versionId|lane, suite:'heldout'|'smoke'}` | `{evalId}` |
| /api/eval/status | GET | `?evalId` | `{done, total, partialMetrics}` |
| /api/metrics | GET | `?scope=heldout|live` | ScoreboardRow[] + learning curve points |
| /api/health | GET | — | `{mubit:'ok'|'mock'|'down', db:'ok'|'down', demoMode}` |

Note: shop state for live lanes lives client-side in the iframe; for verdicts we send the final `ShopState` JSON to `/api/agent/finish` and the server runs the same oracle (single source of truth, and stored for audit).

---

## 17. Database schema (Drizzle + Neon) — `lib/db/schema.ts`
```ts
export const runs = pgTable('runs', {
  id: text('id').primaryKey(), lane: text('lane').notNull(), model: text('model').notNull(),
  versionId: text('version_id'), taskId: text('task_id').notNull(), seed: integer('seed').notNull(),
  layoutTag: text('layout_tag').notNull(), bugs: jsonb('bugs').$type<string[]>().notNull(),
  status: text('status').notNull(), correct: boolean('correct'), steps: integer('steps').default(0),
  costUsd: doublePrecision('cost_usd'), latencyP50: integer('latency_p50'), promptChars: integer('prompt_chars'),
  isEval: boolean('is_eval').default(false), evalId: text('eval_id'),
  startedAt: timestamp('started_at').defaultNow(), endedAt: timestamp('ended_at'),
});
export const steps = pgTable('steps', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), idx: integer('idx').notNull(),
  snapshot: text('snapshot').notNull(), messages: jsonb('messages').notNull(), raw: text('raw'),
  action: jsonb('action').notNull(), result: text('result'), callId: text('call_id'),
  latencyMs: integer('latency_ms'), tokensIn: integer('tokens_in'), tokensOut: integer('tokens_out'),
  state: jsonb('state'), // ShopState before the action (needed for augmentation)
});
export const corrections = pgTable('corrections', {
  id: text('id').primaryKey(), stepId: text('step_id'), runId: text('run_id'), parentId: text('parent_id'),
  source: text('source').notNull(), // human | augmented
  rule: text('rule'), goal: text('goal').notNull(), messages: jsonb('messages').notNull(),
  badAction: jsonb('bad_action'), goodAction: jsonb('good_action').notNull(), semKey: text('sem_key'),
  seed: integer('seed'), mubitFeedbackId: text('mubit_feedback_id'),
  status: text('status').notNull(), // queued | sent | failed | trained
  versionId: text('version_id'), createdAt: timestamp('created_at').defaultNow(),
});
export const modelVersions = pgTable('model_versions', {
  id: text('id').primaryKey(), mubitVersionId: text('mubit_version_id'), label: text('label').notNull(),
  baseModel: text('base_model').notNull(), examples: integer('examples'), status: text('status').notNull(),
  promoted: boolean('promoted').default(false), heldBackReason: text('held_back_reason'),
  createdAt: timestamp('created_at').defaultNow(), readyAt: timestamp('ready_at'),
  metrics: jsonb('metrics'),
});
export const evals = pgTable('evals', {
  id: text('id').primaryKey(), versionId: text('version_id'), lane: text('lane'),
  total: integer('total'), done: integer('done').default(0), metrics: jsonb('metrics'),
  createdAt: timestamp('created_at').defaultNow(),
});
```
DB client: `drizzle(neon(process.env.DATABASE_URL!))`. If `DATABASE_URL` missing → in-memory store with identical query API (`lib/db/memory.ts`) so dev never blocks.

---

## 18. Environment variables (`.env.example`)
```
# --- Mubit (fill from kickoff) ---
MUBIT_ENABLED=true
MUBIT_BASE_URL=                    # TODO(MUBIT) OpenAI-compatible base URL
MUBIT_API_KEY=
MUBIT_PROVIDER_KEY_HEADER=         # TODO(MUBIT) e.g. x-provider-key, if passthrough needs OpenAI key
MUBIT_REQUEST_ID_HEADER=x-request-id   # TODO(MUBIT)
MUBIT_FEEDBACK_URL=                # TODO(MUBIT)
MUBIT_REFRESH_URL=                 # optional TODO(MUBIT)
MUBIT_VERSIONS_URL=                # TODO(MUBIT)
MUBIT_VERSION_MODE=model_suffix    # model_suffix | header | console_pin
MUBIT_VERSION_HEADER=              # if header mode
MUBIT_SUPPORTS_JSON_MODE=true
MUBIT_SUPPORTS_METADATA=false
MUBIT_MEMORY_FALLBACK=false
MUBIT_ENDPOINT=https://api.mubit.ai   # memory SDK (fallback only)

# --- Models ---
OPEN_BASE_MODEL=                   # TODO(MUBIT) open model id
CLOSED_MODEL=gpt-4o-mini           # baseline; confirm current model + price on the day
OPENAI_API_KEY=

# --- App ---
DATABASE_URL=                      # Neon via Vercel Marketplace
DEMO_MODE=false
MAX_STEPS=16
REFRESH_MIN_EXAMPLES=40
EVAL_CONCURRENCY=4
SEND_ACCEPTED=false
REVEAL_R7_AT=6
NEXT_PUBLIC_DEFAULT_SEED=9001
```
`lib/pricing.ts`: `{ [model]: { inPerM, outPerM, source: 'url', checkedAt: 'date' } }` — fill on the day from the provider's pricing page. Never invent open-model prices.

---

## 19. Demo mode, recording, fallbacks

- **Recorder** (`scripts/record-demo.ts` + in-app `Shift+R`): records a full live session — every step (action, latency, verdict), corrections, version events — to `/public/demo/session-*.json`.
- **DEMO_MODE** (`D` hotkey, or env): lanes replay the recording with real timings; all animations identical; ReplayBanner always visible. Toggle < 1s, no reload.
- **Fallback matrix:**

| Failure | Response |
|---|---|
| Mubit slow/down live | `D` → replay. Say "network's flaky, here's the run we recorded at 08:42, real timings." |
| Refresh slower than slot | Ring shows live progress; promote the version trained in rehearsal (timestamp shown); live one finishes during Q&A |
| No explicit train API | Automatic mode: ring driven by version polling, copy "Mubit detected new corrections → refreshing" |
| Open model bad at JSON | Pass top-25 elements only; add one-shot example; fallback output format `{"i":7,"t":"click"}` |
| No lift by Sat 17:30 | Cut to 3 strongest rules, double rescues on them, verify payload with Mubit team, lean on Track 2 (cost/latency at parity) + live R7 |
| Closed baseline can't route via Mubit | Show cached baseline from earlier, labelled — never break the rule |
| Vercel issue | `npm run build && npm start` on laptop against same Neon DB |
| Venue Wi-Fi | Phone hotspot tested in advance |

---

## 20. Deployment on Vercel

1. Push repo to GitHub, import in Vercel, framework Next.js.
2. Vercel Marketplace → add **Neon** → `DATABASE_URL` auto-injected. Run `npm run db:push` locally against it.
3. Add all env vars (Production + Preview).
4. Route handlers: `export const runtime = 'nodejs'; export const maxDuration = 60;`
5. Use `after()` from `next/server` for background feedback submission and eval chunks.
6. `next.config.ts`: allow iframe same-origin (default fine); set `headers()` so `/shop/*` has `X-Frame-Options: SAMEORIGIN`.
7. Deploy early (H2) and redeploy often. The demo runs from the production URL in Chrome fullscreen (F11), zoom 100%, 1920×1080.

---

## 21. Multi-agent workstreams + agent prompts

Contracts (§5) are written by Agent B in the first hour and frozen. Each agent owns its folders.

### Agent A — Shop engine & NIGHT MARKET
Owns: `lib/shop/*`, `components/shop/*`, `app/shop/*`, `tests/shop|snapshot|oracle`.
Done when: all 12 tasks completable via `applyAction` in tests; layouts deterministic per seed; bugs/violations/oracle correct; shop looks premium; bridge + executor animate actions.
> **Prompt:** "Read plan.md fully. You own §7, §8, §9.1, §9.7. Implement the pure shop engine in `lib/shop` (no DOM), the NIGHT MARKET React shop in `components/shop` + `app/shop/[seed]`, and the postMessage bridge/executor. Write vitest tests proving: same seed → identical snapshot; each task T1–T12 can be completed by a scripted correct action sequence on 5 random seeds; each rule violation is recorded; each bug makes the oracle require report_bug. Make the shop look like a premium real DTC store. Do not touch other folders."

### Agent B — Agent loop & Mubit backbone
Owns: `lib/agent/*` (except loop.ts UI hooks), `lib/mubit/*`, `lib/db/*`, `app/api/*`, `scripts/smoke-mubit.ts`, `lib/pricing.ts`.
Done when: smoke script makes a real Mubit call and a feedback call; `/api/agent/step` returns valid actions for all lanes; corrections stored + sent; versions/refresh endpoints work in explicit and automatic modes; mock client mirrors real interface.
> **Prompt:** "Read plan.md fully. First, create the contract files in §5 exactly, commit, and announce them. Then implement §9.2–9.5, §11, §16, §17, §18. All model calls go through `lib/mubit/client.ts` only. Every unknown Mubit detail is an env-configurable TODO(MUBIT). Implement `mock.ts` with the same interface. Write `scripts/smoke-mubit.ts` that prints latency for chat, feedback, versions. Use zod everywhere."

### Agent C — Mission Control UI
Owns: `components/mission/*`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `lib/store/*`, `lib/agent/loop.ts`.
Done when: Mission Control matches §14 pixel-for-pixel in spirit, all animations smooth at 60fps, hotkeys work, works with mock end to end, then with real API.
> **Prompt:** "Read plan.md fully. You own §14 and the client loop §9.6. Build Mission Control to an extremely high visual bar: dark control room, Mubit pipe with particles, three lanes with iframes, ghost cursors, verdict stamps, rescue overlay, correction cards flying into the tray, training ring, version flip, scoreboard with learning curve, control deck with hotkeys. Develop against the mock client from hour 1. Test at 1920×1080 and 1280×720. Respect prefers-reduced-motion."

### Agent D — Training data, eval, demo safety
Owns: `lib/train/*`, `lib/eval/*`, `app/lab`, `app/corrections`, `app/attract`, `scripts/seed-corrections|run-eval|record-demo`, `public/demo`, DEMO_MODE replay.
Done when: augmentation produces 8 valid examples per rescue; held-out eval runs server-side in <4 min; metrics + gate correct; /lab, /corrections, /attract polished; recorder and replay work.
> **Prompt:** "Read plan.md fully. You own §12, §13, §15, §19. Implement augmentation by semKey remapping, the 48-run held-out suite with disjoint seeds (assert it), the server-side eval runner in chunks, metrics with Mubit's wording, the promotion gate, the /lab, /corrections (incl. Rescue queue mode), /attract pages, and the demo recorder + DEMO_MODE replay. Write tests for augmentation and the gate."

### Human roles
- **Mubit liaison** (1 person, first 2h): get answers to §3 questions, fill §11.5, then joins rescues.
- **Demo owner** (1 person, from H0): owns §24 script, rehearsals, recording, attract mode, README, backup video.
- **Rescue crew** (everyone, Saturday): ≥40 human rescues via Rescue queue.

---

## 22. Timeline with go/no-go gates
H0 = Fri 19:30. Clocks go back at 02:00 Sun (extra hour).

| When | Milestone | Gate |
|---|---|---|
| Fri 21:30 (H2) | Contracts frozen; repo deployed to Vercel; Mubit smoke test (1 chat + 1 feedback) | If no key/access: continue on mock, escalate to Mubit team |
| Sat 01:30 (H6) | Shop engine + 12 tasks + tests; one lane end-to-end in UI on mock | Ghost cursor clicks real elements |
| Sat 05:30 (H10) | Real Mubit on all lanes; held-out eval runs; baseline numbers for GPT and Base v1 | **Gap check:** Base v1 fails ≥40% of held-out healthy runs on rules. If not: add decoys/harder rules |
| Sat 11:30 (H16) | Rescue overlay + augmentation + feedback live; ≥15 human rescues; first refresh observed | Office hours: confirm refresh mechanics, fill §11.5 |
| Sat 17:30 (H22) | v2 promoted with measurable lift; bug recall not lower; UI polish pass 1 | **No lift →** §19 fallback plan |
| Sat 23:30 (H28) | ≥40 rescues, v3; ICL lane; /lab /corrections; demo recordings captured. **Feature freeze** | — |
| Sun 01:00–09:30 | Polish pass 2, bug bash, 6+ timed rehearsals, attract mode, README, 2 backup videos | — |
| Sun 10:00 | Code freeze, submit | — |

---

## 23. Testing and rehearsal checklist
- [ ] `npm test` green: snapshot determinism, task completability, oracle verdicts per bug, parser invalid-id handling, augmentation remap correctness, gate logic.
- [ ] `npm run smoke:mubit` prints chat/feedback/versions latencies.
- [ ] Held-out eval < 4 min at concurrency 4; results in /lab.
- [ ] One rescue → 1 human + 8 augmented, all visible with exact payloads in /corrections; Mubit feedback ids stored.
- [ ] Version promotion only on gate pass; held-back state renders; rollback works.
- [ ] Judge's turn on 10 random unseen seeds: no crash, every lane ends with a verdict ≤ 16 steps.
- [ ] Projector test 1920×1080 and 1280×720; iframe text ≥ 14px effective.
- [ ] Venue Wi-Fi + hotspot. `D` toggles replay instantly.
- [ ] 3:00 script fits in 2:45 three times in a row. 1:30 expo version rehearsed.
- [ ] README: problem, architecture diagram, how Mubit is used (only verified claims), metrics, honest limitations.
- [ ] Two backup videos recorded (3:00 and 1:30).

---

## 24. Demo script

### 3:00 stage version
- **0:00–0:20 Hook.** Mission Control idle, three lanes. "QA teams rescue their AI testers all day — and the testers never remember. RETRY turns every rescue into a model update, through Mubit."
- **0:20–0:55 Pain.** `R` on T2 "Buy two Ember Mugs using the test coupon". GPT passes slowly, cost ticking. Base v1 accepts the protection plan → **POLICY VIOLATION R1**, then fumbles the coupon → **STUCK**. "Every company has rules like this. No model knows them."
- **0:55–1:30 Rescue.** Click "Not now", tag R1. Card flies through the Mubit pipe. "That rescue is now a training example for the exact call that failed — re-rendered across 8 layouts." Point at tray: "47 rescues from our night shift."
- **1:30–2:05 Update.** `T` (or ring already filling). Point at learning curve: "Each version is evaluated on 48 held-out runs it never trained on — success up, bug detection never allowed to drop." Ring completes → **v4 → v5 flip**. "Versioned. Evaluated before promotion. Reversible."
- **2:05–2:40 Proof — Judge's turn.** Hand clicker to a judge: `S` (site reshuffles live), `J`. RETRY passes the unseen layout; Base fails; GPT passes at 3× the cost and latency (scoreboard). Then `B` → **BUG REPORTED: "Total shows £NaN after coupon"** with a ready-made ticket.
- **2:40–3:00 Close.** "Self-healing tools guess. RETRY learns your rules into its own open model, keeps pace with every release, and still catches real regressions. Every call through Mubit. Every rescue a model update."

### 1:30 expo version
Pain (15s) → Rescue (20s) → Version flip (20s) → Judge's turn + bug catch (35s).

---

## 25. Judge Q&A answers
- **"Why not just put corrections in the prompt?"** "We measured it." Turn on ICL lane / open /lab: prompt grows with every correction, so latency and cost grow; adapter prompt stays constant. If ICL matches quality, say so — the win is cost/latency at equal quality and no retrieval misses on unseen layouts.
- **"Aren't augmented examples cheating?"** "Each is the same human decision on a different layout, labelled and inspectable in /corrections. Eval seeds are disjoint from training seeds — enforced in code."
- **"Won't it learn to always say done?"** "A quarter of training pairs are bug reports, and promotion is blocked if bug recall drops." Show a held-back version if one exists.
- **"Does this work on real sites?"** "The agent only needs a semantic snapshot. In production that comes from Playwright or an accessibility tree. We self-hosted the shop so evaluation is deterministic and auditable this weekend."
- **"How many corrections until it changes?"** Show learning curve with real counts.
- **"What exactly does Mubit do here?"** Only the verified facts from §11.5: routes all lanes, receives corrections, builds the versioned update, serves vN.
- **"Is the rule list hidden from the model unfair?"** "That's the real world: house rules live in people's heads and Slack threads. Corrections are how they reach the model."
- **"Business?"** "QA Wolf's median contract is ~$83K/yr of humans-in-the-loop. RETRY makes every human minute compound." (Say verbally, not on slides.)

---

## 26. Definition of done
- [ ] Every LLM call goes through `lib/mubit/client.ts` → Mubit. Verified by grep: no other `openai` import.
- [ ] Live: a rescue creates a correction, it reaches Mubit, a new version appears and is promoted after held-out eval — on screen.
- [ ] Held-out scoreboard shows RETRY vN beating Base v1 on verified success with bug recall ≥ v1, and beating GPT on cost and latency.
- [ ] Judge's turn works on any unseen seed.
- [ ] Bug catch works for all 4 bug types.
- [ ] DEMO_MODE replay works offline.
- [ ] Deployed on Vercel production URL; README + 2 backup videos ready.
- [ ] It looks stunning on a projector.

## 27. Workstream interfaces (frozen with §5)

Every workstream codes against these exact signatures. Implementations live in the named files.

```ts
// lib/shop/layout.ts
export function makeLayout(seed: number, versionIndex: number): LayoutConfig;
// lib/shop/catalog.ts
export const CATALOG: Product[]; export function getProduct(sku: string): Product;
// lib/shop/tasks.ts
export const TASKS: Task[]; export function getTask(id: string): Task;
// lib/shop/rules.ts
export const RULES: Record<RuleId, { id: RuleId; title: string; short: string }>;
// lib/shop/engine.ts
export function initialState(seed: number, versionIndex: number, bugs?: BugId[], opts?: { collectRequired?: boolean }): ShopState; // opts additive (Agent E): engine records R3 only when collectRequired (stored on ShopStateX.ui)
export function applyAction(state: ShopState, semKey: string, value?: string): { state: ShopState; effect: 'ok' | 'no_effect' };
export function elements(state: ShopState): AgentElement[];           // ids e1..eN
export function resolveTarget(state: ShopState, id: string): string | undefined; // id -> semKey
export function findBySemKey(state: ShopState, semKey: string): string | undefined; // semKey -> id
export function act(state: ShopState, action: AgentAction): { state: ShopState; result: StepResult; semKey?: string };
// lib/shop/snapshot.ts
export function renderSnapshot(state: ShopState): string;
// lib/shop/oracle.ts
export function judge(task: Task, state: ShopState, finalAction: AgentAction | null, opts?: { stuck?: boolean }): Verdict;

// lib/mubit/index.ts
export function getMubit(): MubitClient;        // real client if MUBIT_ENABLED=true, else mock
export function mubitMode(): 'real' | 'mock';
// lib/agent/prompt.ts
export function buildMessages(p: { goal: string; history: HistoryItem[]; snapshot: string; lane: LaneId; iclExamples?: string[] }): Msg[];
// lib/agent/parse.ts
export function parseAction(raw: string, validIds: string[]): { action: AgentAction | null; error?: string };
// lib/agent/policy.ts
export function decide(req: StepRequest): Promise<StepResponse & { messages: Msg[] }>; // pure-ish: no DB
export function nextAction(req: StepRequest, state?: ShopState): Promise<StepResponse>; // decide + persist step
// lib/agent/stuck.ts
export function detectStuck(history: HistoryItem[], violationsBefore: number, violationsAfter: number, maxSteps: number): boolean;
// lib/agent/lanes.ts
export const LANES: Record<LaneId, { id: LaneId; label: string; color: string; modelRef: () => ModelRef }>;
// lib/db/index.ts  — `repo` facade; Neon if DATABASE_URL else in-memory (same API)
export const repo: { runs, steps, corrections, versions, evals }  // insert/update/get/list per table
```

Mock model semantics (lib/mubit/mock.ts): `model` strings are `closed:<id>`, `open:<id>`; the mock reads the snapshot text in the last user message and returns JSON actions. Base/open v1 deliberately breaks rules R1–R7 at rule moments; an open model with a `versionId` follows every rule that has ≥1 correction in that version's training set (`repo.versions` / corrections with `versionId`), so lift is driven by real stored corrections, never hard-coded. Closed lane = smart general model without org knowledge: follows R1/R5/R6 ~93% (seeded), uses the 4242 test card instead of the saved card ~93% (R4 = common QA practice), never knows R2 (NIGHTSHIFT), R3 (UK collect) or R7; slower/costlier. Learned R3 → collect only when the goal says UK test order.

**Let's win this.**

---

## 28. Bridge protocol (`lib/shop/bridge.ts`, implemented by Agent A)

All messages are `window.postMessage` between Mission Control (parent) and the shop iframe (`/shop/[seed]?lane&task&bugs=a,b&v=<versionIndex>`), same origin only (`event.origin === location.origin`). Coordinates are CSS px in the unscaled 1280×800 shop viewport; the parent multiplies by its frame scale.

| Direction | Message | Reply / notes |
|---|---|---|
| parent → iframe | `{type:'retry:snapshot', reqId}` | `{type:'retry:snapshot:res', reqId, snapshot, ids, state, layoutTag}` — `ids` = element ids in the snapshot |
| parent → iframe | `{type:'retry:act', reqId, action: AgentAction}` | during animation `{type:'retry:cursor', x, y, pressed?}` (move, then `pressed:true`, then `pressed:false` after apply); then `{type:'retry:act:res', reqId, result: StepResult, semKey?, state, layoutTag}`. Acts are queued (serial). `type` animates characters at 25ms; `scroll` scrolls 400px; `done`/`report_bug` return `ok` with no change. |
| parent → iframe | `{type:'retry:highlight', enabled}` | rescue-hover mode: amber outline + chip `e3 · button · Not now`. Human clicks are NOT applied; iframe posts `{type:'retry:pick', id, semKey, role, label}` |
| parent → iframe | `{type:'retry:apply', reqId, semKey, value?}` | applies a human-chosen action via `applyAction`; `{type:'retry:apply:res', reqId, result:'ok'\|'no_effect', state, layoutTag}` |
| parent → iframe | `{type:'retry:reset', seed, versionIndex, bugs, taskId?}` | rebuilds `initialState` (taskId → collectRequired; omitted = keep current); replies `{type:'retry:ready', layoutTag, state}` |
| iframe → parent | `{type:'retry:ready', layoutTag, state}` | on mount and after reset |
| iframe → parent | `{type:'retry:state', state, layoutTag}` | after a human interacts with the shop directly (outside highlight mode) |

Notes: `state` is the full `ShopState` (plus an optional `ui` field with product qty / coupon & payment messages / `payAttempts`, see `ShopStateX` in `lib/shop/engine.ts`). `lib/shop/solver.ts` exports `solveStep(task, state)` — the ideal rule-following action (handles every modal, layout and bug). `lib/shop/bugs.ts` exports `bugsAffecting(task, bugs)`: `coupon_500` only counts for coupon tasks (T2, T6, T8, T11), so suites should pair it with those.

---

## 29. Training, eval & demo interfaces (Agent D)

**Refresh lifecycle** (`app/api/_lib/refresh.ts`, `GET /api/refresh/status?jobId`): `collecting → training → evaluating → promoted | held_back`.
The poll on which training finishes always returns `evaluating` (progress 0) first (Agent E). `evaluating` runs the 48-run held-out suite on the new version (plus the currently promoted version if it has no eval yet), one chunk per poll (whole suite per poll on mock). Response adds `eval: {done,total,evalId,baselineEvalId?}` while evaluating and `gate: {pass,reasons,headline,comparedTo}` once decided. Gate (§13.4) result + metrics are stored on `model_versions.metrics`; held-back versions get `heldBackReason` = `"HELD BACK — regression on bug detection (…)"`.

**Eval** (`lib/eval/*`): `suite.ts` (`heldoutSuite()` 48 runs, seeds 9000–9047, 16 bug runs = 4 per bug, coupon_500 only on T2/T6/T8/T11; `assertDisjointPools()` training 1–200 / held-out 9000–9047 / judge ≥10000), `runner.ts` (`startEval`, `advanceEval`, `runEval`, `latestFinished`; concurrency `EVAL_CONCURRENCY`, chunk `EVAL_CHUNK`=8; runs persisted with `isEval`+`evalId`, run id `<evalId>_<idx>`), `metrics.ts` (`METRICS` = Mubit wording; `computeMetrics`), `gate.ts` (`gate(next, prev)`), `board.ts` (`heldoutBoard()` rows + learning curve + ICL curve, `ensureBaselines()`).
- `POST /api/eval/run {versionId?|lane?, suite}` → `{evalId,total}`; `GET /api/eval/status?evalId` → `{evalId,lane,versionId,done,total,finished,partialMetrics}` (each poll advances a chunk).
- `GET /api/metrics?scope=heldout` lazily evaluates GPT + Base v1 baselines when no eval exists; adds `icl` points.
- Mock speed: `lib/mubit/mock.ts` gained an additive `withMockFast(fn)` (AsyncLocalStorage) — inside it the mock skips its sleep; reported `latencyMs` is unchanged. Eval/bootstrap use it, so 48 runs take well under a second.

**Training data** (`lib/train/*`): `augment.ts` (`augmentCorrection(correction, step, ctx?)` → 8 rows `source:'augmented'`, `parentId`; pure `augmentExamples()`), `detect.ts` (pure `detectRescue(task,state,action,history)` — stuck points + correct action from the solver; used by backlog and Rescue queue), `backlog.ts` (scripted overnight backlog over training seeds, R1–R6 + BUG, never R7), `bootstrap.ts` (`ensureBootstrap()`).
- Correction `source` values: `human` (a person), `scripted` (solver-generated backlog — never shown as human), `augmented`.
- `POST|GET /api/demo/bootstrap` → `{ran, mode, ms, scripted, examples, byRule, versions[]}`. Idempotent (skips when scripted corrections exist), cached per server instance (Vercel lambdas each rebuild the same deterministic data in ~2–3 s on mock). On real Mubit it only creates corrections + feedback + baselines — no fabricated versions.
- Lab APIs: `GET /api/lab` (versions, board, curve, icl, matrix columns), `GET /api/lab/run?runId` (step replay), `GET /api/lab/export` (JSONL), `POST /api/attract/run {seed≥10000, taskId, bugs, versionIndex}`.

**Demo recording / replay** (`lib/demo/*`, client-safe):
```ts
import { loadRecording, createReplay, type Recording } from '@/lib/demo';
const rec: Recording = await loadRecording();          // /demo/session-default.json
const r = createReplay(rec, { onEvent: (e) => { /* drive lanes */ }, speed: 1, loop: false, onEnd });
r.play(); r.pause(); r.stop(); r.position();
```
`Recording = { format:'retry-recording@1', id, title, recordedAt, source:'simulator'|'live', mubitMode, timing:'real'|'simulated', honestLabel, durationMs, events }` where each event has `at` (ms from start) and `kind`:
`scene` (sceneId, title, caption, taskId, goal, seed, versionIndex, bugs, layoutTag, lanes[{lane,label,versionLabel}]) → reset each lane iframe (`retry:reset`);
`step` (lane, runId, stepIdx, action, result, latencyMs, costUsd, promptChars, snapshot) → `retry:act` with the action (engine is deterministic);
`verdict` (lane, runId, verdict, steps) → stamp; `correction` (lane, rule, source, badAction, goodAction, augmented) → card animation;
`version` (phase, label, progress, examples?, headline?) → training ring / badge; `caption` (text).
Always show `rec.honestLabel` in the ReplayBanner. Recorder for live sessions: `createRecorder({title, source:'live', mubitMode, timing:'real'})` → `add(event)` … `finish()`. Regenerate the default with `npm run record:demo`.

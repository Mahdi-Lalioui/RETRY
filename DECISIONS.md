# Decisions (one line each)

- [D] Scripted backlog corrections are labelled `source:'scripted'` (yellow badge), never `human`; the solver supplies the right action.
- [D] Bootstrap batches rescues into v2 (R1,R3,R4,R5), v3 (+R6,BUG), v4 (+R2,stuck) so the learning curve has real, growing points.
- [D] Bootstrap never fabricates versions on real Mubit; on mock it trains instantly (MOCK_TRAIN_SECONDS=0 scoped to bootstrap).
- [D] Held-out "Rescues needed per 10 runs" = runs ending stuck or in a violation per 10 runs.
- [D] Gate compares against the currently promoted version's held-out eval; v1 is evaluated as the base lane.
- [D] Bug runs: per round coupon_500 on one coupon task, the other 3 bugs on 3 distinct non-coupon tasks (4 per bug, 16 total).
- [D] Mock eval speed via additive `withMockFast()` in lib/mubit/mock.ts (AsyncLocalStorage), not a global env flip.
- [D] Held-out matrix shows tasks × evals with 4 seed squares per cell; ICL evals appear as extra columns.
- [D] /attract runs judge's turns server-side (`/api/attract/run`) and replays the actions in real shop iframes.
- [D] Updated tests/api.test.ts expectation: refresh now evaluates v1+v2 on 48 runs, so the board's base row has 48 runs.
- Live rescues only on Base and RETRY lanes; GPT and ICL lanes end with their violation verdict (keeps the stage demo readable).
- Modal overlay in the shop uses a solid dim instead of backdrop-blur (Chromium mirrors edges inside scaled iframes).

## Agent F
- [F] Story strip captions are derived client-side from existing store state + the `stamp` bus event; no store additions.
- [F] "How Mubit is used" overlay (`?`, or the top-bar button) states only what the app does: route calls, capture rescue as feedback, versioned adapter, 48-run held-out gate.
- [F] Lane deck tilts 7° in CSS 3D only while idle and straightens as soon as any lane has steps (so rescue clicks hit-test on a flat iframe).
- [F] Rescue spotlight dims the other lanes to 35% (opacity/transform only); removed every backdrop-filter over or inside the scaled shop iframes.
- [F] Promotion is one deck-wide effect (light sweep, cyan particles, "v4 → v5 PROMOTED" plate) driven by the existing `burst` event; the per-lane cyan sweep was removed.
- [F] Mubit core burst is timed to the card's arrival (1.75s after the `card` event), matching the FlyingCards timeline.
- [F] Scoreboard hides "Prompt size" unless the ICL lane is on (identical across lanes otherwise) so it fits at 1280×720.
- [F] Raised --faint/--muted and the panel-label/caption sizes for projector contrast; body text ≥12px in the new UI.
- [F] Replaced the default favicon.ico with an original app/icon.svg (circular-arrow glyph) and added app/opengraph-image.tsx.

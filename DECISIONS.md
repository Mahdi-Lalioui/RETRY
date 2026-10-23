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

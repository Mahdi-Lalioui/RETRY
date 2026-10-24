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
- [E] R3 is task-scoped: UK test orders = T1, T3, T5, T7, T11 (5/12; T9 dropped from the suggested set so a general model has 4 org-rule-free tasks); engine records R3 only with `ui.collectRequired`.
- [E] Closed mock = general QA sense: R1/R5/R6 and R4 (4242 card) each ~93%, never R2/R3/R7; R4 coin keyed per run's checkout labels, coins avalanche-mixed (FNV suffix correlation made "50%" coins far off).
- [E] Non-UK orders: solver/mock choose standard delivery; bridge `retry:reset` takes optional taskId (omitted = keep current collect requirement).
- [E] D replay lives in lib/agent/demo-driver.ts (registered via setReplayProvider in boot); recording's honestLabel goes to store `replayLabel` (banner must render it).
- [E] Shift+R live recorder installed from boot() as a capture-phase window listener (Hotkeys.tsx untouched); download on second press.
- [E] Adapted lane: an unknown client versionId resolves by badge label, then to the instance's promoted version (was silently naive → "Yes, add cover" after promotion on another instance).
- [E] REVEAL_R7_AT stays 6: Mission Control starts at layout-v4, so "Ship new version" reaches R7 on the 2nd press.
- [E] Live rescue after a violation restores the pre-action shop state (new bridge msg `retry:restore`) so the human picks the right element on the page where the model went wrong.
- [E] Mock DECLINE regex matches "No gift wrap" (was unmatched → learned-R7 versions still clicked the first button, often "Add gift wrap").
- [E] Mission tray on boot shows bootstrap corrections too, marked `source:'scripted'` on CorrectionView.
- [E] Refresh status reports 'evaluating' on the poll where training finishes, so the ring shows training → evaluating → promoted on mock too.

## Verification pass — 24 October 2026
- Work in the fresh user-requested clone on main; preserve the existing design and fix reproduced correctness/reliability failures.
- Keep provider failures as failed evaluation trials and block promotion on infrastructure errors, incomplete coverage or missing/invalid metrics.
- Credit bug reports only after observable regression evidence, not hidden injection flags.
- Treat only seeded v1 as the baseline; preserve remote adapter identity independently of example counts and reject unaddressable versions.
- Resolve lane models from server configuration, validate shop/action HTTP inputs, and load .env.local for CLI scripts.
- Official Mubit uses its mbt_ key, /openai/v1 provider proxy and x-middleware-request-id; provider secrets are not forwarded.
- Local correction persistence means queued, not delivered; reconcile delivery status before showing sent or trained.
- Keep the full learning demo labelled mock until correction delivery and exact baseline/served-version identities are verified; separate open-provider access is not established as a requirement for Mubit's managed automatic adapters.

## Live adapter evidence — 24 October 2026
- Distinguish direct adapter pinning from transparent routing: public model IDs cannot select an adapter, while the authenticated workspace enables automatic training, approval after tests and rollout. A blanket claim that Mubit cannot serve adapters through the gateway is unsupported.
- Keep the existing configured requested model and client; do not substitute an open model or invent correction, refresh, version or routing APIs. Groq/OpenRouter `provider_key_missing` blocks those baselines, not necessarily Mubit's managed adapter bases.
- Label live traffic `scripted-state-real-gateway-output` and record `requestedModel` independently of serving identity. The 60-call batch requested `gpt-4o-mini` and all real gateway outputs parsed successfully on scripted shop checkpoints. These are not human rescues, accepted examples or evidence of trained/serving adapters.
- Track task `ln_59528eba80467078eac9bba6`, key `lk1_b13b77178816b887be7542bc756eca91`. At 11:55 London: 311 calls, 250 usable, 1 kept of 25 required, 1 rejected, 248 waiting; review today 200 queued, 50 over limit, 11 running; first training not started and no route. Counters describe the task snapshot, not the 60-call batch alone.
- `npm run train:live -- --examples 60 --output work/training-evidence.json` sends bounded billable gateway traffic and saves actual evidence. Keep training/held-out seeds disjoint, concurrency at most 3, no-overwrite output, and no guessed feedback/refresh calls.
- Keep metadata support false for the verified OpenAI route after HTTP 400 without provider storage; use distinct first user messages for Mubit's documented session fallback. Do not alter provider storage or quality/promotion bars to make training appear complete.
- Treat automatic workspace promotion and RETRY's local held-out gate as separate mechanisms. A fair live comparison needs actual baseline/version serving identities, not a requested model name or a passed adapter badge.
- Scope the observed task ID and 60-call batch to their earlier system prompt. Changed instructions may create a new Mubit task; identify future calls' task rather than combining their counts with the old snapshot.

## Agent H
- [H] Mubit impact strip sits on the right of the story strip (held-out scope only, hidden during a rescue). Every number comes from the existing scoreboard rows. Cost shows GPT $/run next to "RETRY on own credits" because RETRY's cost is null, so no "× cheaper" figure is shown.
- [H] Version rail (v1→vN chips, +rules learned vs the previous ready version) sits under the training ring. It reads /api/versions through a component hook; the popover shows only stored held-out metrics.
- [H] Judge's turn intro wraps judgesTurn() in components (judge.ts): the overlay shows first, the seed digits roll until judgesTurn sets the real unseen seed, then they lock. lib/ is untouched.
- [H] Bug mic-drop fires only on the RETRY lane's bug_reported verdict. BugReportCard's delay is raised to 1.5s so the ticket slides out after the slam.
- [H] Presenter mode (P, saved in localStorage) hides [data-dev] chrome (seed, clock, captions, ticket picker). It enlarges the narration only at ≥1536px so 720p never clips.
- [H] The scoreboard's RETRY column count-up waits ~900ms after a promotion so it rolls as the training ring closes.
- [H] /attract: fixed-aspect lanes, a centred big caption band, a live "calls routed through Mubit" counter (one per replayed model step), a held-out scoreboard ticker from /api/metrics, and Esc/Exit back to Mission Control.
- [H] Rule radar skipped: there is no free space at 1280×720 without shrinking the shops, and the version rail + impact strip tell the same story.

## Agent G
- [G] Rescue picks that would themselves break a house rule (simulated on the engine) or repeat the stuck no-op are refused; the overlay stays open with `rescue.rejected` set.
- [G] Textbox/select rescue picks need a value before they become a correction (no empty type/select training pairs).
- [G] `POST /api/refresh` with zero queued corrections returns `{skipped}` instead of minting a duplicate version; the ring returns to collecting.
- [G] Mock learning can regress honestly: human "done" corrections that overrule bug reports, once they outnumber report_bug corrections, make the version forget BUG, so the gate holds it back.
- [G] Cold instance: `/api/agent/step` bootstraps when the client names a version this instance doesn't know (not on every step, so unit tests stay isolated).
- [G] Client `api()` retries network errors / 502-504 twice (700 ms backoff) so a redeploy mid-run doesn't stamp "failed" verdicts.
- [G] Real client wraps chat errors as "Mubit timed out after Nms" / "Mubit unreachable: …" (keys redacted); /api/health reports `down` for 60 s after a failure until the next success; the client re-reads health after lane errors and at run end.
- [G] Vitest testTimeout/hookTimeout 60 s; eval wall-clock bound loosened to 45 s (3-4 s suites flaked at the 5 s default under load).
- [G] Malformed `state` on /api/agent/step is dropped (was a 500).

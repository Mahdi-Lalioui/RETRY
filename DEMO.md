# Stage run sheet (3 minutes)

Live: https://retry-one-iota.vercel.app — Chrome, fullscreen (F11), zoom 100%.

**Before every rehearsal and before going on stage:** `npm run reset:demo`, then reload the page.
Have only one copy of the app open (laptop and Vercel share the same database).

| Time | Press | What happens | Say |
|---|---|---|---|
| 0:00 | — | Idle hero over three lanes | "QA teams rescue their AI testers all day, and the testers never remember. RETRY turns every rescue into a model update, through Mubit." |
| 0:20 | **R** | T2 runs. GPT (real call through Mubit, `mreq_` ids in its log) breaks **R2**, Base breaks **R1**, rescue opens on Base | "Every company has rules like this. No model knows them." |
| 0:45 | click **No thanks**, **Enter** | Card flies through the Mubit core into the tray (1 human + 8 augmented). Base breaks R1 again → "a rescue can't change a model mid-run" | "That rescue is now a training pair for the exact call that failed, re-rendered on 8 layouts." |
| 1:05 | — | RETRY v4 passes | "RETRY already learned these from last night's rescues." |
| 1:15 | **S** | New release ships: layout-v6 adds a brand-new rule, **R7 decline gift wrap** | "Your team just shipped a redesign with a new rule." |
| 1:20 | **R** | RETRY v4 clicks "Add gift wrap" → **POLICY VIOLATION R7** → rescue opens on RETRY | "Even our own model hasn't seen this one." |
| 1:35 | click **No gift wrap**, **Enter** | Card flies to Mubit; RETRY breaks R7 again → "Press T: Mubit turns the rescue into v5" | |
| 1:45 | **T** | Ring: Mubit building update → evaluating on 48 held-out runs → **v5 +R7 promoted** (~18 s) | "Versioned, evaluated on runs it never trained on, promoted only if nothing regresses. Reversible." |
| 2:10 | **R** | RETRY v5 declines gift wrap → **PASS** | "One rescue. One update. Fixed." |
| 2:25 | **J** (hand to a judge) | Judge's turn on an unseen seed: RETRY passes, others break rules | |
| 2:40 | **B**, **2**, **R** | Dead pay button → RETRY files a **Regression detected** ticket | "And it still knows a redesign from a real bug." |
| 2:55 | — | | "Self-healing tools guess. RETRY learns your rules. Every call through Mubit. Every rescue a model update." |

Notes
- One rescue per lane per run; after the first Base rescue, Base only stamps verdicts (it never learns, by design).
- **Esc** skips a rescue, but with no rescue open it stops all lanes. Press it once.
- **?** opens "How Mubit is used". Only the GPT lane makes real Mubit calls; the update loop is a labelled simulation.
- If the network fails, run locally: `npm run build && npm start` (same database).

// Sends real RETRY next-action calls through Mubit so it can group them into one task and train an adapter
// (Mubit trains automatically once a task has enough kept examples; see docs.mubit.ai/guides/first-adapter).
// Uses the closed lane on TRAINING seeds only (1–200), never held-out or judge seeds.
// Usage: npx tsx --env-file=.env.local scripts/mubit-warm.ts [runs=24] [lane=adapted]
// lane=adapted needs MUBIT_LIVE_LANES to include adapted: RETRY's policy-following calls become Mubit's RETRY task.
import { simulateRun } from '@/lib/agent/sim';
import { TASKS } from '@/lib/shop/tasks';
import { liveLanes, mubitMode } from '@/lib/mubit';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import type { LaneId } from '@/lib/agent/types';

const runs = Number(process.argv[2] ?? 24);
const lane = (process.argv[3] ?? 'adapted') as LaneId;
(async () => {
  if (mubitMode() !== 'real' && !liveLanes().includes(lane)) { console.error(`[warm] lane ${lane} is not live: set MUBIT_LIVE_LANES (or MUBIT_ENABLED=true) with MUBIT_BASE_URL`); process.exit(1); }
  await ensureBootstrap(); // versions + learned rules for the RETRY lane
  let calls = 0; let done = 0;
  const jobs = Array.from({ length: runs }, (_, i) => ({ task: TASKS[i % TASKS.length], seed: 1 + ((i * 37) % 200) }));
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) {
      try {
        const r = await simulateRun({ task: j.task, seed: j.seed, versionIndex: 1 + (j.seed % 5), bugs: [], lane });
        calls += r.steps.length; done++;
        console.log(`[warm] ${done}/${runs} ${j.task.id} seed=${j.seed} ${r.verdict.status} · ${r.steps.length} calls`);
      } catch (e) { console.log(`[warm] ${j.task.id} seed=${j.seed} error ${String(e).slice(0, 120)}`); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`[warm] sent ~${calls} real calls of the ${lane} lane's task through Mubit`);
})();

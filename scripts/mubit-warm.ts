// Sends real RETRY next-action calls through Mubit so it can group them into one task and train an adapter
// (Mubit trains automatically once a task has enough kept examples; see docs.mubit.ai/guides/first-adapter).
// Uses the closed lane on TRAINING seeds only (1–200), never held-out or judge seeds.
// Usage: MUBIT_ENABLED=true npx tsx --env-file=.env.local scripts/mubit-warm.ts [runs=24]
import { simulateRun } from '@/lib/agent/sim';
import { TASKS } from '@/lib/shop/tasks';
import { mubitMode } from '@/lib/mubit';

const runs = Number(process.argv[2] ?? 24);
(async () => {
  if (mubitMode() !== 'real') { console.error('[warm] MUBIT_ENABLED=true and MUBIT_BASE_URL are required'); process.exit(1); }
  let calls = 0; let done = 0;
  const jobs = Array.from({ length: runs }, (_, i) => ({ task: TASKS[i % TASKS.length], seed: 1 + ((i * 37) % 200) }));
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) {
      try {
        const r = await simulateRun({ task: j.task, seed: j.seed, versionIndex: 1 + (j.seed % 5), bugs: [], lane: 'closed' });
        calls += r.steps.length; done++;
        console.log(`[warm] ${done}/${runs} ${j.task.id} seed=${j.seed} ${r.verdict.status} · ${r.steps.length} calls`);
      } catch (e) { console.log(`[warm] ${j.task.id} seed=${j.seed} error ${String(e).slice(0, 120)}`); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`[warm] sent ~${calls} real calls of the retry-next-action task through Mubit`);
})();

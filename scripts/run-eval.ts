// plan §13 — run the 48-run held-out suite from the CLI and print the scoreboard.
// Usage: npm run eval                      → bootstrap (if needed) + print every lane/version
//        npm run eval -- --lane base       → one fresh eval for a lane (optionally --version <id|label>)
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { runEval, finalMetrics } from '@/lib/eval/runner';
import { METRICS, type EvalMetrics } from '@/lib/eval/metrics';
import { heldoutBoard } from '@/lib/eval/board';
import { findVersion } from '@/lib/db/queries';
import type { LaneId } from '@/lib/agent/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function print(rows: { label: string; m: EvalMetrics }[]) {
  const w = 28;
  console.log(''.padEnd(w) + rows.map((r) => r.label.padStart(16)).join(''));
  for (const d of METRICS) console.log(d.label.padEnd(w) + rows.map((r) => d.fmt((r.m[d.key] as number | null) ?? null).padStart(16)).join(''));
}

async function main() {
  const lane = arg('lane') as LaneId | undefined;
  if (lane) {
    const v = arg('version') ? await findVersion(arg('version')!) : null;
    const t0 = Date.now();
    const ev = await runEval({ lane, versionId: v?.id ?? null, suite: 'heldout', label: v?.label ?? lane, examples: v?.examples ?? 0 });
    console.log(`eval ${ev.id} ${lane} ${v?.label ?? ''} — ${ev.done}/${ev.total} runs in ${Date.now() - t0}ms`);
    print([{ label: v?.label ?? lane, m: finalMetrics(ev)! }]);
    return;
  }
  const s = await ensureBootstrap();
  console.log(`bootstrap: ${s.ran ? 'ran' : 'cached'} in ${s.ms}ms (${s.mode})`);
  const b = await heldoutBoard();
  print(b.rows.map((r) => ({ label: r.label.replace(' · ', ' ').slice(0, 15), m: r })));
  console.log('\nLearning curve (cumulative corrections → verified success):');
  for (const p of b.curve) console.log(`  ${p.label.padEnd(4)} ${String(p.corrections).padStart(4)} → ${p.verifiedSuccess === null ? '—' : Math.round(p.verifiedSuccess * 100) + '%'}  ${p.status}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

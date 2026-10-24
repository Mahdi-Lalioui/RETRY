// plan §12.3 — build the scripted overnight backlog + v2/v3/v4 with held-out evals (same as POST /api/demo/bootstrap).
// In-memory DB unless DATABASE_URL is set (then it writes to Neon). Usage: npm run seed:corrections
import './env';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { repo } from '@/lib/db';

async function main() {
  const s = await ensureBootstrap();
  console.log(`mode=${s.mode} ran=${s.ran} in ${s.ms}ms · scripted=${s.scripted} examples=${s.examples}`);
  console.log('scripted rescues by rule:', s.byRule);
  for (const v of await repo.versions.list()) {
    const m = v.metrics as { verifiedSuccess?: number; bugRecall?: number; falseAlarms?: number } | null;
    console.log(`${v.label.padEnd(4)} examples=${String(v.examples).padStart(4)} promoted=${v.promoted} ${v.heldBackReason ?? ''} success=${m?.verifiedSuccess ?? '—'} recall=${m?.bugRecall ?? '—'} falseAlarms=${m?.falseAlarms ?? '—'}`);
  }
  for (const e of await repo.evals.list()) {
    const m = e.metrics as { verifiedSuccess?: number; bugRecall?: number; label?: string; promptChars?: number; p50LatencyMs?: number } | null;
    console.log(`eval ${String(e.lane).padEnd(8)} ${String(m?.label ?? e.versionId).padEnd(22)} ${e.done}/${e.total} success=${m?.verifiedSuccess?.toFixed(2)} recall=${m?.bugRecall?.toFixed(2)} prompt=${Math.round(m?.promptChars ?? 0)} p50=${m?.p50LatencyMs}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

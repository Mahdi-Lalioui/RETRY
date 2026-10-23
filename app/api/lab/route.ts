// OWNED BY AGENT D — GET /api/lab: everything /lab renders (versions, held-out matrix, curves, scoreboard). Bootstraps lazily.
import { repo } from '@/lib/db';
import { mubitMode } from '@/lib/mubit';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { heldoutBoard } from '@/lib/eval/board';
import { evalConfig, finalMetrics, isFinished } from '@/lib/eval/runner';
import { heldoutSuite } from '@/lib/eval/suite';
import { errorResponse, ok } from '../_lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export interface MatrixCell { runId: string; status: string; correct: boolean | null; steps: number; reason: string | null }
export interface MatrixColumn { evalId: string; lane: string; label: string; versionId: string | null; examples: number; cells: (MatrixCell | null)[] }

export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get('bootstrap') !== '0') await ensureBootstrap();
    const board = await heldoutBoard();
    const versions = await repo.versions.list();
    const evals = (await repo.evals.list()).filter((e) => isFinished(e) && evalConfig(e)?.suite === 'heldout');
    const suite = heldoutSuite();
    const columns: MatrixColumn[] = [];
    // oldest → newest, one column per finished held-out eval
    for (const e of [...evals].reverse()) {
      const runs = await repo.runs.list({ evalId: e.id });
      const byIdx = new Map(runs.map((r) => [Number(r.id.split('_').pop()), r]));
      const c = evalConfig(e)!;
      const v = versions.find((x) => x.id === e.versionId);
      const label = e.lane === 'closed' ? 'GPT' : e.lane === 'icl' ? `ICL·${c.examples ?? 0}` : v?.label ?? c.label ?? e.lane ?? '?';
      columns.push({
        evalId: e.id, lane: e.lane ?? '', label, versionId: e.versionId, examples: c.examples ?? v?.examples ?? 0,
        cells: suite.map((it) => {
          const r = byIdx.get(it.idx);
          return r ? { runId: r.id, status: r.status, correct: r.correct ?? null, steps: r.steps ?? 0, reason: r.reason ?? null } : null;
        }),
      });
    }
    const rank = (c: MatrixColumn) => (c.lane === 'closed' ? 0 : c.lane === 'icl' ? 2 : 1);
    columns.sort((a, b) => rank(a) - rank(b) || a.examples - b.examples);
    const corrections = await repo.corrections.list();
    return ok({
      mode: mubitMode(), db: repo.kind,
      versions: versions.map((v) => ({ ...v, evalMetrics: finalMetrics(evals.find((e) => e.versionId === v.id)) })),
      current: board.current?.id ?? 'v1',
      board: board.rows, curve: board.curve, icl: board.icl,
      suite, columns,
      totals: {
        corrections: corrections.length,
        human: corrections.filter((c) => c.source === 'human').length,
        scripted: corrections.filter((c) => c.source === 'scripted').length,
        augmented: corrections.filter((c) => c.source === 'augmented').length,
        bugExamples: corrections.filter((c) => c.goodAction?.type === 'report_bug').length,
      },
    });
  } catch (e) { return errorResponse(e); }
}

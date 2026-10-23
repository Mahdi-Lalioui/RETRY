// OWNED BY AGENT D — GET /api/lab/export → the training dataset as JSONL (exact pairs sent to Mubit).
import { repo } from '@/lib/db';
import { ensureBootstrap } from '@/lib/train/bootstrap';
import { errorResponse } from '../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureBootstrap();
    const cs = (await repo.corrections.list()).reverse();
    const lines = cs.map((c) => JSON.stringify({
      id: c.id, source: c.source, parent_id: c.parentId, rule: c.rule, seed: c.seed, status: c.status, version_id: c.versionId,
      mubit_feedback_id: c.mubitFeedbackId, input: c.messages, preferred_output: JSON.stringify(c.goodAction),
      bad_output: c.badAction ? JSON.stringify(c.badAction) : null,
    }));
    return new Response(lines.join('\n') + '\n', {
      headers: { 'content-type': 'application/x-ndjson', 'content-disposition': `attachment; filename="retry-dataset-${new Date().toISOString().slice(0, 10)}.jsonl"` },
    });
  } catch (e) { return errorResponse(e); }
}

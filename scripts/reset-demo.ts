// npm run reset:demo — roll the shared Neon database back to the bootstrapped starting point
// (v1–v4, 450 scripted/augmented examples, v4 promoted, 0 human rescues) so every rehearsal
// and the stage demo begin from the same state. Deletes only data created after bootstrap:
// human rescues and their augmented copies, versions after v4 and their evals, and live runs.
import './env';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (nothing to reset for the in-memory store).');
  const sql = neon(url);

  const [v4] = await sql`select id, created_at from model_versions where label = 'v4' order by created_at limit 1`;
  if (!v4) throw new Error('No v4 found: load the app once so it bootstraps, then rerun.');

  const later = await sql`select id, label, created_at from model_versions where created_at > ${v4.created_at}`;
  const laterIds = later.map((v) => v.id as string);
  const firstLater = later.length ? later.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at : null;

  const evals = firstLater ? await sql`select id from evals where version_id = any(${laterIds}) or created_at >= ${firstLater}` : [];
  const evalIds = evals.map((e) => e.id as string);

  const humans = await sql`select id from corrections where source = 'human'`;
  const humanIds = humans.map((c) => c.id as string);

  const delCorr = await sql`delete from corrections where source = 'human' or parent_id = any(${humanIds}) returning id`;
  const delRuns = await sql`delete from runs where is_eval = false or eval_id = any(${evalIds}) returning id`;
  await sql`delete from steps where run_id not in (select id from runs)`;
  await sql`delete from evals where id = any(${evalIds})`;
  await sql`delete from model_versions where id = any(${laterIds})`;
  await sql`update model_versions set promoted = (id = ${v4.id})`;

  console.log(`[reset] removed ${later.length} version(s) ${later.map((v) => v.label).join(' ')}, ${evalIds.length} eval(s), ` +
    `${delCorr.length} rehearsal correction(s), ${delRuns.length} run(s). v4 is promoted again.`);
  console.log('[reset] Reload Mission Control (and any other open tabs) to start fresh.');
}

main().catch((e) => { console.error('[reset]', e instanceof Error ? e.message : e); process.exit(1); });

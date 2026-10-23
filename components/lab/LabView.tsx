'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LabData, LabVersion, MatrixCell, MatrixColumn } from './types';
import { IclChart, LearningCurve } from './Charts';
import { LANE_COLOR, RuleChip, STATUS_COLOR, Stat, Tabs, actionText, pct } from './ui';
import { METRICS } from '@/lib/eval/metrics';
import { TASKS } from '@/lib/shop/tasks';
import { BUGS } from '@/lib/shop/bugs';

type Tab = 'versions' | 'matrix' | 'curve' | 'icl' | 'admin';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? 'request failed');
  return j.data as T;
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 26 };

export function LabView() {
  const [data, setData] = useState<LabData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('versions');
  const [replay, setReplay] = useState<{ runId: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<LabData>('/api/lab')); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const t = localStorage.getItem('rx-lab-tab') as Tab | null; if (t) setTab(t); } catch { /* ignore */ }
  }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('rx-lab-tab', t); } catch { /* ignore */ } };

  if (err) return <div className="mx-auto max-w-[1680px] px-6 py-10"><div className="panel p-6 text-[#F43F5E]">Lab failed to load: {err}</div></div>;
  if (!data) return <LabSkeleton />;

  const cur = data.versions.find((v) => v.id === data.current);
  const adapted = data.board.find((r) => r.lane === 'adapted');
  const base = data.board.find((r) => r.lane === 'base');
  const gpt = data.board.find((r) => r.lane === 'closed');

  return (
    <main className="mx-auto max-w-[1680px] px-6 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--rx-learn)]">Lab</div>
          <h1 className="mt-1 text-[34px] font-semibold tracking-[-0.03em]">Every rescue, measured on runs it never trained on.</h1>
          <p className="mt-2 max-w-[880px] text-[15px] muted">
            48 held-out runs · 12 tasks × 4 unseen seeds (9000–9047) · 16 with an injected bug · training seeds 1–200, judge seeds ≥10000 — disjoint, enforced in code.
            {data.mode === 'mock' && <span className="ml-2 rounded border border-[#FACC1555] px-1.5 py-0.5 text-[11px] text-[#FACC15]">MOCK MODEL</span>}
          </p>
        </div>
        <Tabs<Tab> value={tab} onChange={pick} tabs={[
          { id: 'versions', label: 'Versions', hint: String(data.versions.length) },
          { id: 'matrix', label: 'Held-out matrix' },
          { id: 'curve', label: 'Learning curve' },
          { id: 'icl', label: 'ICL vs adapter' },
          { id: 'admin', label: 'Admin' },
        ]} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={`Verified success · ${cur?.label ?? 'v1'}`} value={pct(adapted?.verifiedSuccess ?? base?.verifiedSuccess)} color="#22D3EE"
          sub={<>Base v1 {pct(base?.verifiedSuccess)} · GPT {pct(gpt?.verifiedSuccess)}</>} />
        <Stat label="Bug recall" value={pct(adapted?.bugRecall ?? base?.bugRecall)} sub={<>never allowed to drop (gate)</>} />
        <Stat label="Rescues needed / 10 runs" value={(adapted ?? base)?.rescuesPer10?.toFixed(1) ?? '—'} sub={<>Base v1 {base?.rescuesPer10?.toFixed(1) ?? '—'}</>} />
        <Stat label="Training examples" value={data.totals.corrections} sub={<>{data.totals.human} human · {data.totals.scripted} scripted · {data.totals.augmented} augmented</>} />
        <Stat label="Bug-report examples" value={pct(data.totals.corrections ? data.totals.bugExamples / data.totals.corrections : null)} sub={<>target ≥25% (§12.2)</>} />
      </div>

      <AnimatePresence mode="wait">
        <motion.section key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="mt-6">
          {tab === 'versions' && <VersionsTab data={data} reload={load} />}
          {tab === 'matrix' && <MatrixTab data={data} onOpen={(runId, title) => setReplay({ runId, title })} />}
          {tab === 'curve' && <CurveTab data={data} />}
          {tab === 'icl' && <IclTab data={data} />}
          {tab === 'admin' && <AdminTab data={data} reload={load} />}
        </motion.section>
      </AnimatePresence>
      <RunDrawer replay={replay} onClose={() => setReplay(null)} />
    </main>
  );
}

function LabSkeleton() {
  return (
    <main className="mx-auto max-w-[1680px] px-6 pt-8">
      <div className="h-10 w-[560px] rounded-lg bg-white/[0.04] sweep" />
      <div className="mt-6 grid grid-cols-5 gap-3">{Array.from({ length: 5 }, (_, i) => <div key={i} className="panel h-[92px] sweep" />)}</div>
      <div className="panel mt-6 h-[420px] sweep" />
      <p className="mt-4 text-[13px] muted">Building the overnight backlog and running held-out evals on this instance…</p>
    </main>
  );
}

// ---------------- Versions ----------------
function VersionsTab({ data, reload }: { data: LabData; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const activate = async (v: LabVersion) => {
    setBusy(v.id);
    try { await api('/api/versions/activate', { method: 'POST', body: JSON.stringify({ versionId: v.id }) }); await reload(); } finally { setBusy(null); }
  };
  const list = [...data.versions].reverse();
  const curIdx = data.versions.findIndex((v) => v.id === data.current);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="relative">
        <div className="absolute bottom-6 left-[27px] top-6 w-px bg-gradient-to-b from-[#22D3EE66] via-[#1C222C] to-transparent" />
        <div className="flex flex-col gap-3">
          {list.map((v) => {
            const m = v.metrics ?? v.evalMetrics;
            const isCur = v.id === data.current;
            const held = !!v.heldBackReason || v.metrics?.gate?.pass === false;
            const idx = data.versions.findIndex((x) => x.id === v.id);
            const color = isCur ? '#22D3EE' : held ? '#F43F5E' : '#3A4352';
            return (
              <motion.div key={v.id} layout transition={spring} className="relative flex gap-4">
                <div className="relative z-10 mt-5 flex h-[14px] w-[56px] shrink-0 justify-center">
                  <span className="h-[14px] w-[14px] rounded-full border-2" style={{ borderColor: color, background: isCur ? '#22D3EE' : '#07080B', boxShadow: isCur ? '0 0 14px #22D3EE' : undefined }} />
                </div>
                <div className="panel flex-1 p-4" style={{ borderColor: isCur ? '#22D3EE55' : held ? '#F43F5E55' : undefined }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="mono text-[24px] font-semibold tracking-tight">{v.label}</span>
                    {isCur && <span className="rounded-full bg-[#22D3EE1A] px-2.5 py-0.5 text-[11px] font-semibold text-[#67E8F9]">SERVING · ADAPTED LANE</span>}
                    {held && <span className="rounded-full border border-[#F43F5E] px-2.5 py-0.5 text-[11px] font-semibold text-[#FDA4AF]">HELD BACK</span>}
                    {!held && !isCur && v.metrics?.gate?.pass && <span className="rounded-full border border-[#34D39955] px-2.5 py-0.5 text-[11px] font-semibold text-[#6EE7B7]">PASSED GATE</span>}
                    {v.status === 'training' && <span className="pulse rounded-full border border-[#FF450066] px-2.5 py-0.5 text-[11px] font-semibold text-[#FF8A5B]">MUBIT BUILDING UPDATE…</span>}
                    <span className="mono text-[12px] muted">{v.id === 'v1' ? 'base open model · no corrections' : `${v.examples ?? 0} examples`}</span>
                    <span className="ml-auto mono text-[11px] faint">{v.id === 'v1' ? 'seeded' : `trained ${fmtTime(v.readyAt ?? v.createdAt)}`}{v.mubitVersionId ? ` · mubit ${v.mubitVersionId}` : ''}</span>
                  </div>
                  {(v.rules?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">{v.rules!.map((r) => <RuleChip key={r} rule={r} small />)}</div>
                  )}
                  {held && <div className="mt-3 text-[13px] text-[#FDA4AF]">{v.heldBackReason ?? v.metrics?.gate?.headline}</div>}
                  {m && (
                    <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
                      {(['verifiedSuccess', 'bugRecall', 'falseAlarms', 'violationsPerRun', 'rescuesPer10', 'p50LatencyMs'] as const).map((k) => {
                        const def = METRICS.find((d) => d.key === k)!;
                        return (
                          <div key={k} className="rounded-lg bg-black/20 px-2.5 py-2">
                            <div className="truncate text-[10px] uppercase tracking-[0.08em] muted">{def.label}</div>
                            <div className="num mt-0.5 text-[16px] font-semibold">{def.fmt((m[k] as number | null) ?? null)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    {!isCur && v.status === 'ready' && (
                      <button className={`btn ${idx < curIdx ? 'btn-amber' : 'btn-learn'}`} disabled={busy === v.id} onClick={() => activate(v)}>
                        {idx < curIdx ? '↺ Roll back to ' : '↑ Promote '}{v.label}
                      </button>
                    )}
                    {v.metrics?.gate && <span className="text-[12px] muted">{v.metrics.gate.comparedTo ? `gated against ${v.metrics.gate.comparedTo}` : ''}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <div className="panel h-fit p-5">
        <div className="text-[13px] font-semibold">Learning curve</div>
        <div className="text-[12px] muted">held-out verified success vs cumulative corrections</div>
        <LearningCurve curve={data.curve} icl={data.icl} board={data.board} height={300} compact />
        <div className="mt-4 rounded-lg border hairline bg-black/20 p-3 text-[12px] leading-5 muted">
          <b className="text-[var(--rx-text)]">Promotion gate.</b> A version replaces the serving one only if verified success does not drop, bug recall does not drop, and false alarms grow by at most one. Otherwise it is <span className="text-[#FDA4AF]">held back</span> and the previous version keeps serving.
        </div>
      </div>
    </div>
  );
}

function fmtTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------- Matrix ----------------
function cellColor(c: MatrixCell | null, bug: boolean) {
  if (!c) return { bg: '#0A0D12', fg: '#3A4352', glyph: '·' };
  if (c.status === 'passed') return { bg: '#34D39926', fg: '#34D399', glyph: '✓' };
  if (c.status === 'bug_reported' && bug) return { bg: '#34D39926', fg: '#34D399', glyph: '⚑' };
  if (c.status === 'bug_reported') return { bg: '#F59E0B22', fg: '#F59E0B', glyph: '!' };
  if (c.status === 'violation') return { bg: '#F43F5E2E', fg: '#F43F5E', glyph: 'R' };
  if (c.status === 'stuck') return { bg: '#F59E0B26', fg: '#F59E0B', glyph: '…' };
  return { bg: '#F43F5E2E', fg: '#F43F5E', glyph: '✕' };
}

function MatrixTab({ data, onOpen }: { data: LabData; onOpen: (runId: string, title: string) => void }) {
  const cols = data.columns;
  const [hover, setHover] = useState<string | null>(null);
  const rows = TASKS.map((t) => ({ task: t, items: data.suite.filter((s) => s.taskId === t.id) }));
  const colScore = (c: MatrixColumn) => {
    const ok = c.cells.filter((x, i) => x && x.correct && data.suite[i]).length;
    return `${ok}/48`;
  };
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 border-b hairline px-5 py-3 text-[12px] muted">
        <span className="font-medium text-[var(--rx-text)]">Tasks × versions · each cell = 4 held-out seeds</span>
        {[['✓', '#34D399', 'passed'], ['⚑', '#34D399', 'bug correctly reported'], ['R', '#F43F5E', 'policy violation'], ['…', '#F59E0B', 'stuck'], ['✕', '#F43F5E', 'failed / missed bug'], ['!', '#F59E0B', 'false alarm']].map(([g, c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className="mono inline-flex h-4 w-4 items-center justify-center rounded text-[10px]" style={{ background: `${c}26`, color: c }}>{g}</span>{l}</span>
        ))}
        <span className="ml-auto">click a square → step replay</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--rx-panel)] px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.1em] muted">Task</th>
              {cols.map((c) => (
                <th key={c.evalId} className="px-2 py-3 text-center">
                  <div className="mono text-[13px] font-semibold" style={{ color: LANE_COLOR[c.lane] }}>{c.label}</div>
                  <div className="mono text-[10px] muted">{c.lane === 'closed' ? 'closed' : `${c.examples} ex`} · {colScore(c)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ task, items }) => (
              <tr key={task.id} className="group">
                <td className="sticky left-0 z-10 border-t hairline bg-[var(--rx-panel)] px-5 py-2.5 group-hover:bg-[#10141B]">
                  <div className="flex items-center gap-2">
                    <span className="mono w-8 text-[12px] font-semibold text-[var(--rx-learn)]">{task.id}</span>
                    <span className="max-w-[360px] truncate text-[13px]">{task.goal}</span>
                  </div>
                  <div className="mt-1 flex gap-1 pl-10">
                    {items.map((it) => <span key={it.seed} className="mono rounded bg-white/[0.03] px-1 text-[10px] faint">{it.seed}{it.bugs[0] ? <span className="text-[#F43F5E]"> · {BUGS[it.bugs[0]].title}</span> : ''}</span>)}
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.evalId} className="border-t hairline px-2 py-2.5 text-center group-hover:bg-[#10141B]">
                    <div className="inline-grid grid-cols-4 gap-1">
                      {items.map((it) => {
                        const cell = c.cells[it.idx];
                        const s = cellColor(cell, it.bugs.length > 0);
                        const key = `${c.evalId}:${it.idx}`;
                        return (
                          <button key={key} disabled={!cell}
                            onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}
                            onClick={() => cell && onOpen(cell.runId, `${c.label} · ${task.id} · seed ${it.seed}${it.bugs[0] ? ` · ${it.bugs[0]}` : ''}`)}
                            title={cell ? `${it.seed}${it.bugs[0] ? ` [${it.bugs[0]}]` : ''} → ${cell.status} (${cell.steps} steps) ${cell.reason ?? ''}` : 'not run'}
                            className="mono flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold transition-transform hover:scale-110"
                            style={{ background: s.bg, color: s.fg, outline: hover === key ? `1px solid ${s.fg}` : undefined, boxShadow: it.bugs.length ? 'inset 0 -2px 0 #F43F5E88' : undefined }}>
                            {s.glyph}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Run replay drawer ----------------
interface RunDetail {
  run: { id: string; lane: string; status: string; reason: string | null; seed: number; taskId: string; layoutTag: string; bugs: string[]; steps: number; violations: string[] | null };
  steps: { idx: number; snapshot: string; action: { type: string; target?: string; value?: string; reason: string }; result: string | null; latencyMs: number | null; promptChars: number | null }[];
}
function RunDrawer({ replay, onClose }: { replay: { runId: string; title: string } | null; onClose: () => void }) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!replay) return;
    setD(null); setI(0);
    api<RunDetail>(`/api/lab/run?runId=${encodeURIComponent(replay.runId)}`).then(setD).catch(() => setD(null));
  }, [replay]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!replay) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min((d?.steps.length ?? 1) - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [replay, d, onClose]);
  const step = d?.steps[i];
  const target = step?.action.target;
  return (
    <AnimatePresence>
      {replay && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(880px,94vw)] flex-col border-l hairline bg-[var(--rx-panel)] shadow-2xl"
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={spring}>
            <div className="flex items-start gap-4 border-b hairline px-6 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] muted">Step replay · held-out run</div>
                <div className="mono mt-1 text-[16px] font-semibold">{replay.title}</div>
                {d && <div className="mt-1 flex items-center gap-2 text-[12px]">
                  <span className="rounded px-1.5 py-0.5 mono text-[11px] font-semibold" style={{ background: `${STATUS_COLOR[d.run.status]}22`, color: STATUS_COLOR[d.run.status] }}>{d.run.status.replace('_', ' ').toUpperCase()}</span>
                  <span className="muted">{d.run.reason}</span><span className="mono faint">· {d.run.layoutTag}</span>
                </div>}
              </div>
              <button className="btn ml-auto" onClick={onClose}>Close <kbd>Esc</kbd></button>
            </div>
            {!d ? <div className="p-6 muted">Loading…</div> : (
              <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
                <ol className="scroll-thin overflow-y-auto border-r hairline p-3">
                  {d.steps.map((s, k) => (
                    <li key={k}>
                      <button onClick={() => setI(k)} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${k === i ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                        <div className="mono flex items-center gap-2 text-[12px]">
                          <span className="faint">{String(k + 1).padStart(2, '0')}</span>
                          <span className={s.action.type === 'report_bug' ? 'text-[#F43F5E]' : s.action.type === 'done' ? 'text-[#34D399]' : ''}>{actionText(s.action as never)}</span>
                        </div>
                        <div className="mono mt-0.5 pl-6 text-[10px] faint">{s.result ?? '—'} · {s.latencyMs ?? '—'}ms</div>
                      </button>
                    </li>
                  ))}
                </ol>
                {step && (
                  <div className="scroll-thin min-h-0 overflow-y-auto p-5">
                    <div className="panel-2 p-4">
                      <div className="text-[11px] uppercase tracking-[0.12em] muted">Action</div>
                      <div className="mono mt-1 text-[15px]">{actionText(step.action as never)}</div>
                      <div className="mt-1 text-[13px] muted">{step.action.reason}</div>
                    </div>
                    <div className="mt-4 text-[11px] uppercase tracking-[0.12em] muted">Snapshot the model saw · {step.promptChars ?? '—'} prompt chars</div>
                    <pre className="mono mt-2 whitespace-pre-wrap rounded-lg border hairline bg-[#05070A] p-4 text-[12px] leading-[1.7] text-[#C9D1DC]">
                      {step.snapshot.split('\n').map((line, n) => <SnapLine key={n} line={line} target={target} />)}
                    </pre>
                    <div className="mt-3 text-[12px] faint">← → to step through</div>
                  </div>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SnapLine({ line, target }: { line: string; target?: string }) {
  if (!target) return <div>{line}</div>;
  const re = new RegExp(`(\\b${target} \\w+ "[^"]*")`);
  const parts = line.split(re);
  return <div>{parts.map((p, i) => (re.test(p) ? <mark key={i} className="rounded bg-[#22D3EE26] px-0.5 text-[#A5F3FC]">{p}</mark> : <span key={i}>{p}</span>))}</div>;
}

// ---------------- Learning curve ----------------
function CurveTab({ data }: { data: LabData }) {
  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[20px] font-semibold tracking-tight">Learning curve</div>
          <div className="text-[13px] muted">Verified task success on the 48 held-out runs, one dot per version, vs cumulative corrections. Same suite, same model, same budgets.</div>
        </div>
        <div className="flex gap-2 text-[12px]">
          {data.curve.map((p) => (
            <span key={p.versionId} className="panel-2 mono px-3 py-1.5" style={{ borderColor: p.status === 'held_back' ? '#F43F5E66' : p.status === 'current' ? '#22D3EE66' : undefined }}>
              {p.label} <b className="text-[var(--rx-learn)]">{pct(p.verifiedSuccess)}</b> <span className="muted">· {p.corrections} ex · recall {pct(p.bugRecall)}</span>
            </span>
          ))}
        </div>
      </div>
      <LearningCurve curve={data.curve} icl={data.icl} board={data.board} height={560} />
      <Scoreboard data={data} />
    </div>
  );
}

function Scoreboard({ data }: { data: LabData }) {
  const rows = data.board;
  const best = useMemo(() => Object.fromEntries(METRICS.map((m) => {
    const vals = rows.map((r) => r[m.key] as number | null).filter((v): v is number => typeof v === 'number');
    return [m.key, vals.length ? (m.better === 'higher' ? Math.max(...vals) : Math.min(...vals)) : null];
  })), [rows]);
  return (
    <div className="mt-6 overflow-hidden rounded-xl border hairline">
      <table className="w-full text-[13px]">
        <thead className="bg-black/20">
          <tr>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.1em] muted">Held-out (48)</th>
            {rows.map((r) => <th key={r.evalId} className="px-4 py-2.5 text-right"><span className="mono text-[12px] font-semibold" style={{ color: LANE_COLOR[r.lane] }}>{r.label}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key} className="border-t hairline">
              <td className="px-4 py-2 muted">{m.label}</td>
              {rows.map((r) => {
                const v = r[m.key] as number | null;
                const isBest = v !== null && v === best[m.key] && rows.length > 1;
                return <td key={r.evalId} className="num px-4 py-2 text-right" style={{ color: isBest ? '#22D3EE' : undefined, fontWeight: isBest ? 600 : 400 }}>{m.fmt(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t hairline px-4 py-2 text-[11px] faint">Cost: closed model priced from lib/pricing.ts (provider pricing page); open models show “credits” — we never invent open-model prices.</div>
    </div>
  );
}

// ---------------- ICL vs adapter ----------------
function IclTab({ data }: { data: LabData }) {
  const rows = data.curve.filter((c) => c.corrections > 0).map((c) => ({ c, icl: data.icl.find((p) => p.corrections === c.corrections) ?? null }));
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="panel p-6">
        <div className="text-[20px] font-semibold tracking-tight">“Why not put the corrections in the prompt?”</div>
        <p className="mt-1 text-[13px] muted">We measured it. The ICL lane is the same open base model with every stored correction pasted into its system prompt. Its prompt — and so latency and cost — grows with every rescue; the adapter’s stays constant.</p>
        <table className="mt-5 w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.1em] muted">
              <th className="py-2 text-left font-medium">Corrections</th>
              <th className="py-2 text-right font-medium text-[#67E8F9]">Adapter success</th>
              <th className="py-2 text-right font-medium text-[#F9A8D4]">ICL success</th>
              <th className="py-2 text-right font-medium text-[#67E8F9]">Adapter p50</th>
              <th className="py-2 text-right font-medium text-[#F9A8D4]">ICL p50</th>
              <th className="py-2 text-right font-medium text-[#67E8F9]">Adapter prompt</th>
              <th className="py-2 text-right font-medium text-[#F9A8D4]">ICL prompt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, icl }) => (
              <tr key={c.versionId} className="border-t hairline">
                <td className="num py-2.5">{c.corrections} <span className="mono text-[11px] muted">({c.label})</span></td>
                <td className="num py-2.5 text-right">{pct(c.verifiedSuccess)}</td>
                <td className="num py-2.5 text-right">{pct(icl?.verifiedSuccess)}</td>
                <td className="num py-2.5 text-right">{c.p50LatencyMs ?? '—'} ms</td>
                <td className="num py-2.5 text-right">{icl?.p50LatencyMs ?? '—'} ms</td>
                <td className="num py-2.5 text-right">{c.promptChars ? `${(c.promptChars / 1000).toFixed(1)}k` : '—'}</td>
                <td className="num py-2.5 text-right">{icl?.promptChars ? `${(icl.promptChars / 1000).toFixed(1)}k` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.mode === 'mock' && <p className="mt-4 text-[12px] text-[#FACC15]">Mock model: ICL retrieval is simulated (examples matched by rule tag, ~85% recall); latency grows with prompt size. Re-run on real Mubit for real numbers.</p>}
      </div>
      <div className="panel p-6">
        <div className="text-[13px] font-semibold">Prompt size vs corrections</div>
        <IclChart curve={data.curve} icl={data.icl} height={260} />
        <div className="mt-2 text-[13px] font-semibold">Verified success vs corrections</div>
        <LearningCurve curve={data.curve} icl={data.icl} board={data.board} height={260} compact />
      </div>
    </div>
  );
}

// ---------------- Admin ----------------
function AdminTab({ data, reload }: { data: LabData; reload: () => Promise<void> }) {
  const [vid, setVid] = useState(data.versions[data.versions.length - 1]?.id ?? 'v1');
  const [mid, setMid] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [evalTarget, setEvalTarget] = useState<string>(`version:${data.current}`);
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [refresh, setRefresh] = useState<{ phase: string; progress: number; label?: string; headline?: string } | null>(null);

  const setManual = async () => {
    try { await api('/api/versions/activate', { method: 'POST', body: JSON.stringify({ versionId: vid, mubitVersionId: mid || undefined }) }); setMsg(`Pinned ${vid}${mid ? ` → Mubit ${mid}` : ''} and promoted.`); await reload(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const runEval = async () => {
    const [kind, id] = evalTarget.split(':');
    const body = kind === 'version' ? { versionId: id, suite: 'heldout' } : { lane: id, suite: 'heldout' };
    const r = await api<{ evalId: string; total: number }>('/api/eval/run', { method: 'POST', body: JSON.stringify(body) });
    setProg({ done: 0, total: r.total, label: evalTarget });
    for (;;) {
      const s = await api<{ done: number; total: number; finished: boolean }>(`/api/eval/status?evalId=${r.evalId}`);
      setProg({ done: s.done, total: s.total, label: evalTarget });
      if (s.finished) break;
      await new Promise((x) => setTimeout(x, 800));
    }
    await reload();
  };
  const train = async () => {
    const j = await api<{ jobId: string | null; versionId: string }>('/api/refresh', { method: 'POST', body: '{}' });
    for (let i = 0; i < 600; i++) {
      const s = await api<{ phase: string; progress: number; version?: { label: string }; gate?: { headline: string } }>(`/api/refresh/status?jobId=${j.versionId}`);
      setRefresh({ phase: s.phase, progress: s.progress, label: s.version?.label, headline: s.gate?.headline });
      if (s.phase === 'promoted' || s.phase === 'held_back') break;
      await new Promise((x) => setTimeout(x, 1000));
    }
    await reload();
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <div className="panel p-5">
        <div className="text-[14px] font-semibold">Manual Mubit version id</div>
        <p className="mt-1 text-[12px] muted">Last resort (§11.2) when Mubit only exposes versions in its console: pin our version to the Mubit id and promote it.</p>
        <div className="mt-4 flex flex-col gap-2">
          <select className="input" value={vid} onChange={(e) => setVid(e.target.value)}>
            {data.versions.filter((v) => v.status === 'ready').map((v) => <option key={v.id} value={v.id}>{v.label} · {v.examples ?? 0} examples</option>)}
          </select>
          <input className="input mono" placeholder="mubit version id, e.g. ft-retry-0007" value={mid} onChange={(e) => setMid(e.target.value)} />
          <button className="btn btn-learn" onClick={setManual}>Pin & promote</button>
          {msg && <div className="text-[12px] muted">{msg}</div>}
        </div>
      </div>
      <div className="panel p-5">
        <div className="text-[14px] font-semibold">Re-run held-out eval</div>
        <p className="mt-1 text-[12px] muted">48 runs, server-side simulator (no DOM), chunked per poll.</p>
        <div className="mt-4 flex flex-col gap-2">
          <select className="input" value={evalTarget} onChange={(e) => setEvalTarget(e.target.value)}>
            {data.versions.map((v) => <option key={v.id} value={`version:${v.id}`}>{v.label} ({v.examples ? 'adapted' : 'base'})</option>)}
            <option value="lane:closed">GPT · closed</option>
            <option value="lane:icl">ICL · open v1 + examples</option>
          </select>
          <button className="btn btn-learn" disabled={!!prog && prog.done < prog.total} onClick={() => void runEval()}>▶ Run 48 held-out runs</button>
          {prog && <Progress done={prog.done} total={prog.total} />}
        </div>
      </div>
      <div className="panel p-5">
        <div className="text-[14px] font-semibold">Train now</div>
        <p className="mt-1 text-[12px] muted">Request a Mubit refresh; the new version is evaluated on the held-out suite and gated before promotion.</p>
        <div className="mt-4 flex flex-col gap-2">
          <button className="btn btn-amber" onClick={() => void train()} disabled={!!refresh && refresh.phase !== 'promoted' && refresh.phase !== 'held_back'}>⟳ Train now</button>
          {refresh && <div className="text-[12px]"><span className="mono uppercase tracking-[0.08em]" style={{ color: refresh.phase === 'held_back' ? '#F43F5E' : refresh.phase === 'promoted' ? '#34D399' : '#F59E0B' }}>{refresh.phase.replace('_', ' ')}</span> <span className="muted">{refresh.label} · {Math.round(refresh.progress * 100)}%</span>{refresh.headline && <div className="mt-1 muted">{refresh.headline}</div>}</div>}
        </div>
      </div>
      <div className="panel p-5">
        <div className="text-[14px] font-semibold">Export dataset</div>
        <p className="mt-1 text-[12px] muted">Every training pair exactly as sent to Mubit (input messages + preferred output), with source, rule and parent.</p>
        <div className="mt-4 flex flex-col gap-2">
          <a className="btn btn-learn justify-center" href="/api/lab/export" download>⇩ Download JSONL · {data.totals.corrections} rows</a>
          <div className="mono text-[11px] faint">db: {data.db} · mubit: {data.mode}</div>
        </div>
      </div>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const p = total ? done / total : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full bg-[var(--rx-learn)] shadow-[0_0_12px_#22D3EE]" animate={{ width: `${p * 100}%` }} transition={spring} /></div>
      <div className="num mt-1 text-[11px] muted">{done}/{total} runs</div>
    </div>
  );
}

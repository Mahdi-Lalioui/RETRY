'use client';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart, Legend } from 'recharts';
import type { CurvePoint, IclPoint } from '@/lib/eval/board';
import type { BoardRow } from '@/lib/eval/board';

const AX = { stroke: '#3A4352', fontSize: 12, fontFamily: 'var(--font-geist-mono), monospace' };

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="panel-2 px-3 py-2 text-[12px] shadow-xl">{children}</div>;
}

/** x = cumulative corrections, y = verified success (held-out). One dot per version. */
export function LearningCurve({ curve, icl, board, height = 420, compact = false }: { curve: CurvePoint[]; icl: IclPoint[]; board: BoardRow[]; height?: number; compact?: boolean }) {
  const base = board.find((r) => r.lane === 'base')?.verifiedSuccess ?? curve[0]?.verifiedSuccess ?? null;
  const gpt = board.find((r) => r.lane === 'closed')?.verifiedSuccess ?? null;
  const pts = curve.map((p) => ({ x: p.corrections, y: p.verifiedSuccess === null ? null : Math.round(p.verifiedSuccess * 100), label: p.label, status: p.status, recall: p.bugRecall }));
  const iclPts = [{ x: 0, y: base === null ? null : Math.round(base * 100) }, ...icl.map((p) => ({ x: p.corrections, y: p.verifiedSuccess === null ? null : Math.round(p.verifiedSuccess * 100) }))];
  const maxX = Math.max(10, ...pts.map((p) => p.x), ...iclPts.map((p) => p.x));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 24, right: compact ? 16 : 48, bottom: compact ? 8 : 28, left: compact ? -8 : 8 }}>
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <CartesianGrid stroke="#1C222C" strokeDasharray="2 6" vertical={false} />
          <XAxis type="number" dataKey="x" domain={[0, Math.ceil((maxX * 1.06) / 50) * 50]} tick={AX} tickLine={false} axisLine={{ stroke: '#1C222C' }}
            label={compact ? undefined : { value: 'cumulative corrections (training examples)', position: 'insideBottom', offset: -14, fill: '#7A8597', fontSize: 12 }} />
          <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={AX} tickLine={false} axisLine={false}
            label={compact ? undefined : { value: 'verified task success · held-out', angle: -90, position: 'insideLeft', offset: 14, fill: '#7A8597', fontSize: 12 }} />
          {gpt !== null && <ReferenceLine y={Math.round(gpt * 100)} stroke="#94A3B8" strokeDasharray="6 6" strokeOpacity={0.7} label={{ value: `GPT ${Math.round(gpt * 100)}%`, fill: '#94A3B8', fontSize: 11, position: 'insideTopLeft' }} />}
          {base !== null && <ReferenceLine y={Math.round(base * 100)} stroke="#A78BFA" strokeDasharray="3 5" strokeOpacity={0.8} label={{ value: `Base v1 ${Math.round(base * 100)}%`, fill: '#A78BFA', fontSize: 11, position: 'insideTopRight' }} />}
          <Tooltip cursor={{ stroke: '#3A4352' }} content={({ payload }) => {
            const p = payload?.[0]?.payload as { x: number; y: number; label?: string; status?: string; recall?: number | null } | undefined;
            if (!p) return null;
            return <TipBox><div className="mono font-semibold">{p.label ?? 'ICL'}</div><div className="muted">{p.x} corrections</div><div>success <b className="num">{p.y}%</b></div>{p.recall !== undefined && p.recall !== null && <div>bug recall <b className="num">{Math.round(p.recall * 100)}%</b></div>}{p.status && <div className="muted">{p.status.replace('_', ' ')}</div>}</TipBox>;
          }} />
          {icl.length > 0 && <Line data={iclPts} type="linear" dataKey="y" stroke="#F472B6" strokeWidth={2} strokeDasharray="1 0" dot={{ r: 3.5, fill: '#F472B6', stroke: '#07080B', strokeWidth: 2 }} isAnimationActive={false} name="ICL (corrections in prompt)" />}
          <Line data={pts} type="linear" dataKey="y" stroke="#22D3EE" strokeWidth={3} filter="url(#glow)" isAnimationActive animationDuration={700}
            dot={(props: { cx?: number; cy?: number; payload?: { label: string; status: string } }) => {
              const { cx = 0, cy = 0, payload } = props;
              const held = payload?.status === 'held_back';
              const cur = payload?.status === 'current';
              return (
                <g key={`${payload?.label}-${cx}`}>
                  {cur && <circle cx={cx} cy={cy} r={13} fill="#22D3EE22" stroke="#22D3EE55" />}
                  <circle cx={cx} cy={cy} r={6.5} fill={held ? '#07080B' : '#22D3EE'} stroke={held ? '#F43F5E' : '#07080B'} strokeWidth={held ? 2.5 : 2} />
                  <text x={cx} y={cy - 16} textAnchor="middle" fill={held ? '#F43F5E' : '#E8EDF5'} fontSize={compact ? 11 : 13} fontFamily="var(--font-geist-mono), monospace" fontWeight={600}>{payload?.label}{held ? ' ✕' : ''}</text>
                </g>
              );
            }} name="RETRY (adapter via Mubit)" />
          {!compact && <Legend verticalAlign="top" align="left" height={28} wrapperStyle={{ fontSize: 12, color: '#7A8597' }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** ICL vs adapter: prompt size and latency as corrections grow. */
export function IclChart({ curve, icl, height = 300 }: { curve: CurvePoint[]; icl: IclPoint[]; height?: number }) {
  const map = new Map<number, { x: number; iclPrompt?: number; iclLat?: number; adPrompt?: number }>();
  for (const p of icl) map.set(p.corrections, { ...(map.get(p.corrections) ?? { x: p.corrections }), iclPrompt: Math.round((p.promptChars ?? 0) / 100) / 10, iclLat: p.p50LatencyMs ?? undefined });
  const adapted = curve.filter((c) => c.corrections > 0);
  for (const c of adapted) map.set(c.corrections, { ...(map.get(c.corrections) ?? { x: c.corrections }), adPrompt: Math.round((c.promptChars ?? 0) / 100) / 10 });
  const data = [...map.values()].sort((a, b) => a.x - b.x);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 24, left: 0 }}>
          <CartesianGrid stroke="#1C222C" strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey="x" type="number" domain={[0, 'dataMax']} tick={AX} tickLine={false} axisLine={{ stroke: '#1C222C' }} label={{ value: 'corrections', position: 'insideBottom', offset: -12, fill: '#7A8597', fontSize: 12 }} />
          <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}k`} />
          <Tooltip content={({ payload, label }) => payload?.length ? <TipBox><div className="mono muted">{label} corrections</div>{payload.map((p) => <div key={String(p.dataKey)} style={{ color: p.color }}>{p.name}: <b className="num">{p.value}k chars</b></div>)}</TipBox> : null} />
          <Legend verticalAlign="top" align="left" height={26} wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="iclPrompt" name="ICL prompt size" stroke="#F472B6" strokeWidth={2.5} dot={{ r: 4, fill: '#F472B6' }} connectNulls isAnimationActive={false} />
          <Line dataKey="adPrompt" name="Adapter prompt size" stroke="#22D3EE" strokeWidth={2.5} dot={{ r: 4, fill: '#22D3EE' }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

'use client';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CurvePoint } from '@/lib/store/mission';

const TICK = { fill: '#9AA4B4', fontSize: 11, fontFamily: 'var(--font-geist-mono)' };

export function LearningCurve({ points, baseLine }: { points: CurvePoint[]; baseLine?: number | null }) {
  const adapted = points.filter((p) => p.lane === 'adapted').sort((a, b) => a.corrections - b.corrections);
  const icl = points.filter((p) => p.lane === 'icl').sort((a, b) => a.corrections - b.corrections);
  const xs = [...new Set([...adapted, ...icl].map((p) => p.corrections))].sort((a, b) => a - b);
  const span = Math.max(1, (xs[xs.length - 1] ?? 1) - (xs[0] ?? 0));
  let lastLabelX = -Infinity;
  const data = xs.map((x) => {
    const a = adapted.find((p) => p.corrections === x);
    // alternate label below the dot when the previous labelled dot is too close (e.g. v4 450 / v5 459)
    let below = false;
    if (a) { below = (x - lastLabelX) / span < 0.08; lastLabelX = below ? -Infinity : x; }
    return { x, adapted: a?.success ?? null, icl: icl.find((p) => p.corrections === x)?.success ?? null, base: baseLine ?? null, label: a?.version, below };
  });
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-[12px] text-muted">Learning curve appears after the first eval</div>;
  }
  const lastX = xs[xs.length - 1];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 18, right: 22, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22D3EE" stopOpacity="0.38" />
            <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
          <filter id="lc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <CartesianGrid stroke="#1C222C" strokeDasharray="2 6" vertical={false} />
        <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={TICK} tickLine={false} axisLine={{ stroke: '#1C222C' }} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#12161E', border: '1px solid #1C222C', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-geist-mono)' }}
          labelFormatter={(x) => `${x} corrections`}
          formatter={(v, n) => [`${Math.round(Number(v))}%`, String(n)]}
        />
        <Line type="monotone" dataKey="base" stroke="#A78BFA" strokeOpacity={0.7} strokeDasharray="4 4" dot={false} strokeWidth={1.2} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="icl" stroke="#F472B6" strokeWidth={1.6} dot={{ r: 2.5, fill: '#F472B6', strokeWidth: 0 }} connectNulls isAnimationActive={false} />
        <Area type="monotone" dataKey="adapted" stroke="none" fill="url(#lc-area)" connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="adapted" stroke="#22D3EE" strokeWidth={2.4} connectNulls filter="url(#lc-glow)" animationDuration={900}
          activeDot={{ r: 6, fill: '#22D3EE', stroke: '#07080B' }}
          dot={(props: { cx?: number; cy?: number; payload?: { label?: string; below?: boolean; x: number } }) => {
            const { cx = 0, cy = 0, payload } = props;
            if (!payload?.label) return <g key={`n${cx}`} />;
            const cur = payload.x === lastX;
            return (
              <g key={`${payload.label}-${cx}`}>
                {cur && <circle cx={cx} cy={cy} r={10} fill="#22D3EE22" stroke="#22D3EE66" />}
                <circle cx={cx} cy={cy} r={4.5} fill={cur ? '#22D3EE' : '#07080B'} stroke="#22D3EE" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 5px #22D3EE)' }} />
                <text x={cx < 70 ? cx + 6 : cx} y={payload.below ? cy + 18 : cy - 10} textAnchor={cx < 70 ? 'start' : 'middle'} fill={cur ? '#ffffff' : '#B8C1CE'} fontSize={11.5} fontWeight={600} fontFamily="var(--font-geist-mono)">{payload.label}</text>
              </g>
            );
          }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

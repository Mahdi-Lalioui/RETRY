'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CurvePoint } from '@/lib/store/mission';

export function LearningCurve({ points, baseLine }: { points: CurvePoint[]; baseLine?: number | null }) {
  const adapted = points.filter((p) => p.lane === 'adapted').sort((a, b) => a.corrections - b.corrections);
  const icl = points.filter((p) => p.lane === 'icl').sort((a, b) => a.corrections - b.corrections);
  const xs = [...new Set([...adapted, ...icl].map((p) => p.corrections))].sort((a, b) => a - b);
  const data = xs.map((x) => ({
    x,
    adapted: adapted.find((p) => p.corrections === x)?.success ?? null,
    icl: icl.find((p) => p.corrections === x)?.success ?? null,
    base: baseLine ?? null,
    label: adapted.find((p) => p.corrections === x)?.version,
  }));
  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-[11px] text-faint">Learning curve appears after the first eval</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="#1C222C" vertical={false} />
        <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#7A8597', fontSize: 10, fontFamily: 'var(--font-geist-mono)' }} tickLine={false} axisLine={{ stroke: '#1C222C' }} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: '#7A8597', fontSize: 10, fontFamily: 'var(--font-geist-mono)' }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#12161E', border: '1px solid #1C222C', borderRadius: 8, fontSize: 11, fontFamily: 'var(--font-geist-mono)' }}
          labelFormatter={(x) => `${x} corrections`}
          formatter={(v, n) => [`${Math.round(Number(v))}%`, String(n)]}
        />
        <Line type="monotone" dataKey="base" stroke="#7A8597" strokeDasharray="4 4" dot={false} strokeWidth={1.2} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="icl" stroke="#F472B6" strokeWidth={1.5} dot={{ r: 2, fill: '#F472B6', strokeWidth: 0 }} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="adapted" stroke="#22D3EE" strokeWidth={2.2} connectNulls
          dot={{ r: 3.5, fill: '#07080B', stroke: '#22D3EE', strokeWidth: 2 }} activeDot={{ r: 5 }}
          style={{ filter: 'drop-shadow(0 0 6px #22D3EE88)' }} animationDuration={900} />
      </LineChart>
    </ResponsiveContainer>
  );
}

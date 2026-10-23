'use client';
import { useEffect, useState } from 'react';

/** TopBar-style Mubit pill: green "routed via Mubit", yellow "MOCK MODE", red "MUBIT UNREACHABLE". */
export function ModePill() {
  const [h, setH] = useState<{ mubit: string; db: string } | null>(null);
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((j) => j.ok && setH(j.data)).catch(() => setH({ mubit: 'down', db: '?' }));
  }, []);
  if (!h) return <span className="mono text-[11px] faint">…</span>;
  const tone = h.mubit === 'ok' ? ['#34D399', 'routed via Mubit'] : h.mubit === 'mock' ? ['#FACC15', 'MOCK MODE'] : ['#F43F5E', 'MUBIT UNREACHABLE'];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium mono"
      style={{ borderColor: `${tone[0]}55`, color: tone[0], background: `${tone[0]}10` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone[0], boxShadow: `0 0 8px ${tone[0]}` }} />
      {tone[1]}
      <span className="faint">· db {h.db === 'ok' ? 'ok' : h.db}</span>
    </span>
  );
}

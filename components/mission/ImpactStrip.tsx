'use client';
// Agent H: "Mubit impact" — the own-your-intelligence-layer story in one glance, computed only from the scoreboard rows
// already in the store (held-out by default). Re-animates whenever metrics reload (e.g. after a promotion).
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useMission, type ScoreRow } from '@/lib/store/mission';
import { on } from '@/lib/store/bus';

const get = (rows: ScoreRow[], key: string, lane: 'closed' | 'base' | 'adapted') => {
  const v = rows.find((r) => r.key === key)?.values[lane];
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
};

interface Item { k: string; big: string; small: string; color: string; wide?: boolean }

export function ImpactStrip() {
  const rows = useMission((s) => s.rows);
  const k = useMission((s) => s.metricsKey);
  const label = useMission((s) => s.adapted.label);
  const reduce = useReducedMotion();
  const [pulse, setPulse] = useState(0);
  useEffect(() => on('burst', () => setPulse((x) => x + 1)), []);

  const items: Item[] = [];
  const sA = get(rows, 'verifiedSuccess', 'adapted'), sB = get(rows, 'verifiedSuccess', 'base');
  if (sA !== null && sB !== null) items.push({ k: 's', big: `${sA - sB >= 0 ? '+' : ''}${Math.round(sA - sB)} pts`, small: 'success vs base', color: sA >= sB ? '#34D399' : '#F43F5E' });
  const rA = get(rows, 'rescuesPer10', 'adapted'), rB = get(rows, 'rescuesPer10', 'base');
  if (rA !== null && rB !== null) items.push({ k: 'r', big: `${fmt1(rB)}→${fmt1(rA)}`, small: 'rescues / 10 runs', color: '#F59E0B' });
  const lA = get(rows, 'p50LatencyMs', 'adapted'), lG = get(rows, 'p50LatencyMs', 'closed');
  if (lA && lG && lG / lA >= 1.1) items.push({ k: 'l', big: `${(lG / lA).toFixed(1)}×`, small: 'faster than GPT', color: '#22D3EE', wide: true });
  const cA = get(rows, 'costPerRunUsd', 'adapted'), cG = get(rows, 'costPerRunUsd', 'closed');
  if (cA && cG && cG / cA >= 1.1) items.push({ k: 'c', big: `${(cG / cA).toFixed(1)}×`, small: 'cheaper / run', color: '#22D3EE', wide: true });
  else if (cG !== null && cA === null) items.push({ k: 'c', big: `$${cG.toFixed(4)}`, small: 'GPT / run · RETRY on own credits', color: '#94A3B8', wide: true });
  if (!items.length) return null;

  return (
    <motion.div key={pulse} className="flex shrink-0 items-center gap-1.5" initial={pulse && !reduce ? { scale: 1.06 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
      <span className="mr-0.5 whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-mubit 2xl:text-[12px]">Mubit impact · {label}</span>
      {items.map((it, i) => (
        <motion.span key={`${it.k}-${k}`} className={`${it.wide ? 'hidden 2xl:flex' : 'flex'} items-baseline gap-1.5 whitespace-nowrap rounded-md border px-2 py-[2px]`}
          style={{ borderColor: `${it.color}44`, background: `${it.color}12` }}
          initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, type: 'spring', stiffness: 300, damping: 24 }}>
          <span className="tnum font-mono text-[14px] font-bold 2xl:text-[16px]" style={{ color: it.color }}>{it.big}</span>
          <span className="text-[12px] text-white/75 2xl:text-[13px]">{it.small}</span>
        </motion.span>
      ))}
    </motion.div>
  );
}

function fmt1(v: number) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

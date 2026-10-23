'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Verdict } from '@/lib/agent/types';

export function verdictLook(v: Verdict): { title: string; color: string; fill: boolean; sub?: string } {
  switch (v.status) {
    case 'passed': return { title: 'PASS', color: '#34D399', fill: false, sub: v.reason };
    case 'stuck': return { title: 'STUCK', color: '#F59E0B', fill: false, sub: v.reason };
    case 'violation': return { title: `POLICY VIOLATION${v.violations[0] ? ` ${v.violations[0]}` : ''}`, color: '#F43F5E', fill: false, sub: v.reason };
    case 'bug_reported': return { title: 'BUG REPORTED', color: '#F43F5E', fill: true, sub: `“${v.reason}”` };
    case 'failed':
      return /broken/i.test(v.reason)
        ? { title: 'FAILED — PASSED A BROKEN CHECKOUT', color: '#F43F5E', fill: false }
        : { title: 'FAILED', color: '#F43F5E', fill: false, sub: v.reason };
    default: return { title: v.status.toUpperCase(), color: '#7A8597', fill: false };
  }
}

export function VerdictStamp({ verdict, k }: { verdict?: Verdict; k: number }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {verdict && (
        <motion.div key={k} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
          <motion.div
            className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at center, ${verdictLook(verdict).color}22, transparent 70%)` }}
          />
          <Stamp verdict={verdict} reduce={!!reduce} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stamp({ verdict, reduce }: { verdict: Verdict; reduce: boolean }) {
  const look = verdictLook(verdict);
  const long = look.title.length > 14;
  return (
    <motion.div
      initial={reduce ? { rotate: -6, opacity: 0 } : { scale: 1.45, rotate: -6, opacity: 0 }}
      animate={reduce ? { rotate: -6, opacity: 1 } : { scale: 1, rotate: [-6, -7.5, -5, -6], opacity: 1, x: [0, -3, 3, -1, 0] }}
      transition={{ scale: { type: 'spring', stiffness: 420, damping: 18 }, opacity: { duration: 0.12 }, rotate: { duration: 0.35, delay: 0.12 }, x: { duration: 0.3, delay: 0.12 } }}
      className="flex max-w-[88%] flex-col items-center"
    >
      <div
        className="rounded-[10px] border-[3px] px-[0.6em] py-[0.12em] text-center font-black uppercase leading-none tracking-[0.04em]"
        style={{
          fontSize: long ? 'clamp(15px, 2.1vw, 34px)' : 'clamp(26px, 3.6vw, 60px)',
          color: look.fill ? '#fff' : look.color,
          borderColor: look.color,
          background: look.fill ? look.color : '#07080Bcc',
          boxShadow: `0 0 0 1px #000, 0 0 40px ${look.color}66, inset 0 0 18px ${look.color}33`,
          textShadow: look.fill ? 'none' : `0 0 18px ${look.color}88`,
          maskImage: 'radial-gradient(circle at 30% 40%, #000 60%, #000c 100%)',
        }}
      >
        {look.title}
      </div>
      {look.sub && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="mt-2 max-w-full truncate rounded-md bg-black/75 px-2 py-1 text-center font-mono text-[11px] text-white/85 backdrop-blur"
        >
          {look.sub}
        </motion.div>
      )}
    </motion.div>
  );
}

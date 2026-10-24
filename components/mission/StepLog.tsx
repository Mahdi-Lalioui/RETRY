'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { StepEntry } from '@/lib/store/mission';
import { describeAction } from '@/lib/agent/loop';
import { Kbd } from '@/components/ui/Kbd';

const resultColor: Record<string, string> = { ok: '#7A8597', no_effect: '#F59E0B', invalid: '#F43F5E', error: '#F43F5E' };

export function StepLog({ steps, color, idle }: { steps: StepEntry[]; color: string; idle?: boolean }) {
  const last = steps.slice(-3);
  return (
    <div className="relative h-[46px] shrink-0 overflow-hidden px-3 font-mono text-[11px] leading-[15px] 2xl:h-[52px] 2xl:text-[12px] 2xl:leading-[17px]">
      {idle && steps.length === 0 ? (
        <div className="flex h-full items-center gap-2 text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full" style={{ background: color }} />
          <span>standing by</span>
          <span className="ml-auto flex items-center gap-1.5 font-sans text-[11.5px] text-muted">press <Kbd>R</Kbd> to run</span>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {last.map((s, i) => {
            const newest = i === last.length - 1;
            return (
              <motion.div
                key={`${s.idx}-${s.human ? 'h' : 'a'}`}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: newest ? 1 : 0.55, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <span className="w-5 shrink-0 text-right text-faint">{String(s.idx + 1).padStart(2, '0')}</span>
                <span className="min-w-0 truncate" style={{ color: s.human ? '#F59E0B' : newest ? color : '#9AA4B4' }}>
                  {s.human && '✋ '}{describeAction(s.action, s.label)}
                </span>
                <span className="ml-auto shrink-0" style={{ color: resultColor[s.result ?? ''] ?? '#3A4352' }}>{s.result ? `→ ${s.result}` : s.action.type === 'done' || s.action.type === 'report_bug' ? '■' : '…'}</span>
                {s.callId?.startsWith('mreq_') && (
                  <span title={`Real Mubit request ${s.callId}`} className="shrink-0 rounded-[4px] border border-mubit/40 bg-mubit/10 px-1 text-[10px] text-[#FFB08A]">{s.callId.slice(0, 11)}…</span>
                )}
                {!s.human && <span className="w-11 shrink-0 text-right text-faint">{s.latencyMs}ms</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

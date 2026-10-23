'use client';
import { Check } from 'lucide-react';
import type { CorrectionView } from '@/lib/store/mission';
import { RULES } from '@/lib/shop/rules';
import { describeAction } from '@/lib/agent/loop';
import { useMission } from '@/lib/store/mission';
import { cn } from '@/components/ui/cn';

export function CorrectionCard({ c, className, compact }: { c: CorrectionView; className?: string; compact?: boolean }) {
  const adapted = useMission((s) => s.adapted.label);
  const rule = c.rule && c.rule !== 'other' ? RULES[c.rule] : undefined;
  const ruleLabel = c.rule === 'other' ? `Other${c.ruleText ? ` · ${c.ruleText}` : ''}` : rule ? `${rule.id} · ${rule.short}` : 'Untagged';
  const status = {
    queued: { dot: '#F59E0B', text: 'queued', pulse: true },
    sent: { dot: '#FF4500', text: 'sent to Mubit', pulse: false },
    trained: { dot: '#22D3EE', text: `in ${adapted}`, pulse: false },
    failed: { dot: '#F43F5E', text: 'failed — retry', pulse: false },
  }[c.status];
  return (
    <div className={cn('relative w-[280px] overflow-hidden rounded-[10px] border border-white/[0.07] bg-panel-2 py-2 pl-3 pr-2.5 shadow-[0_10px_30px_-12px_#000]', className)}>
      <span className="absolute inset-y-0 left-0 w-[3px] bg-rescue" style={{ boxShadow: '0 0 12px #F59E0B' }} />
      <div className="flex items-center gap-1.5">
        <span className="truncate rounded-[5px] border border-rescue/40 bg-rescue/10 px-1.5 font-mono text-[10.5px] text-[#FCD34D]">{ruleLabel}</span>
        <span className="shrink-0 rounded-[5px] border border-white/10 px-1.5 font-mono text-[10px] text-white/60">human</span>
        <span className="shrink-0 rounded-[5px] border border-white/10 px-1.5 font-mono text-[10px] text-white/60">×{c.augmented} augmented</span>
      </div>
      <div className={cn('mt-1.5 font-mono text-[11px] leading-[16px]', compact && 'mt-1')}>
        <div className="truncate text-fail/90 line-through decoration-fail/60">- {describeAction(c.bad.action, c.bad.label)}</div>
        <div className="truncate text-pass">+ {describeAction(c.good.action, c.good.label)}</div>
      </div>
      {!compact && (
        <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted">
          {c.status === 'trained' ? <Check className="h-3 w-3 text-learn" /> : <span className={cn('h-1.5 w-1.5 rounded-full', status.pulse && 'animate-pulse-slow')} style={{ background: status.dot, boxShadow: `0 0 6px ${status.dot}` }} />}
          <span style={{ color: c.status === 'trained' ? '#22D3EE' : undefined }}>{status.text}</span>
          <span className="ml-auto font-mono text-faint">{c.lane}</span>
        </div>
      )}
    </div>
  );
}

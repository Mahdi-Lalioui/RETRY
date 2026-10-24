'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Bug, Check, Copy, X } from 'lucide-react';
import type { BugReport } from '@/lib/store/mission';
import { getTask } from '@/lib/shop/tasks';

function issueMarkdown(b: BugReport) {
  const t = getTask(b.taskId);
  return [
    `## Regression detected: ${b.evidence}`,
    '',
    `**Found by:** RETRY QA agent  `,
    `**Test:** ${t.id} — ${t.goal}  `,
    `**Page:** \`${b.page}\` · **Layout:** \`${b.layoutTag}\` · **Seed:** \`${b.seed}\``,
    '',
    '### Evidence',
    `> ${b.evidence}`,
    '',
    '### Steps to reproduce',
    ...b.steps.map((s) => `- ${s.replace(/^\d+\.\s*/, '')}`),
    '',
    '_Filed automatically by RETRY · every call routed through Mubit_',
  ].join('\n');
}

export function BugReportCard({ bug, onClose }: { bug: BugReport; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const id = `QA-${(bug.seed % 9000) + 1000}`;
  return (
    <motion.div
      initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.6 }}
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 max-h-[62%] overflow-hidden rounded-[10px] border border-fail/45 bg-[#140a0d] shadow-[0_18px_60px_-12px_#F43F5E55]"
    >
      <div className="flex items-center gap-2 border-b border-fail/25 bg-fail/10 px-2.5 py-1.5">
        <Bug className="h-3.5 w-3.5 text-fail" />
        <span className="text-[12px] font-semibold text-white">Regression detected</span>
        <span className="font-mono text-[10.5px] text-fail/80">{id}</span>
        <span className="rounded-full bg-fail px-1.5 font-mono text-[9.5px] font-bold text-white">P1</span>
        <span className="rounded-full border border-white/15 px-1.5 font-mono text-[9.5px] text-white/60">checkout</span>
        <button onClick={onClose} className="ml-auto text-white/40 hover:text-white" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-1.5 px-2.5 py-2">
        <div className="text-[12.5px] leading-snug text-white">“{bug.evidence}”</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-muted">
          <span>page <span className="text-white/80">{bug.page}</span></span>
          <span>layout <span className="text-white/80">{bug.layoutTag}</span></span>
          <span>seed <span className="text-white/80">{bug.seed}</span></span>
          <span>test <span className="text-white/80">{bug.taskId}</span></span>
        </div>
        {bug.steps.length > 0 && (
          <ol className="max-h-[64px] overflow-hidden font-mono text-[10.5px] leading-[15px] text-white/60">
            <li className="text-[9.5px] uppercase tracking-[0.14em] text-faint">Steps to reproduce</li>
            {bug.steps.slice(-4).map((s) => <li key={s} className="truncate">{s}</li>)}
          </ol>
        )}
        <button
          onClick={async () => { try { await navigator.clipboard.writeText(issueMarkdown(bug)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ } }}
          className="inline-flex h-6 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2 text-[11px] text-white/85 hover:bg-white/[0.1]"
        >
          {copied ? <Check className="h-3 w-3 text-pass" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy as GitHub issue'}
        </button>
      </div>
    </motion.div>
  );
}

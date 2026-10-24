'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { LaneId } from '@/lib/agent/types';
import { useMission } from '@/lib/store/mission';
import { LANE_THEME } from '@/lib/store/lanes';
import { on } from '@/lib/store/bus';
import { ShopFrame } from './ShopFrame';
import { LaneHeader } from './LaneHeader';
import { StepLog } from './StepLog';
import { VerdictStamp, verdictLook } from './VerdictStamp';
import { RescueOverlay, RescuePanel } from './RescueOverlay';
import { BugReportCard } from './BugReportCard';
import { Burst } from './VersionBadge';

export function Lane({ lane }: { lane: LaneId }) {
  const t = LANE_THEME[lane];
  const l = useMission((s) => s.lanes[lane]);
  const patchLane = useMission((s) => s.patchLane);
  const layoutFlash = useMission((s) => s.layoutFlash);
  const dimmed = useMission((s) => !!s.rescue && s.rescue.lane !== lane);
  const [glow, setGlow] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => on('stamp', (e) => {
    if (e.lane !== lane) return;
    const v = useMission.getState().lanes[lane].verdict;
    if (!v) return;
    setGlow(verdictLook(v).color);
    const id = setTimeout(() => setGlow(null), 1200);
    return () => clearTimeout(id);
  }), [lane]);
  useEffect(() => on('burst', (e) => { if (e.lane === lane) setBurst((b) => b + 1); }), [lane]);

  const running = l.status === 'running';
  const rescue = l.status === 'rescue';
  return (
    <motion.section
      layout
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      data-lane-col={lane}
      className={`panel lane-card relative flex min-h-0 min-w-0 flex-col ${dimmed ? 'lane-dim' : ''} ${rescue ? 'lane-spot' : ''}`}
      style={{
        ['--lane' as string]: t.hex,
        borderColor: rescue ? '#F59E0B' : `${t.hex}66`,
        boxShadow: glow ? `0 0 0 2px ${glow}, 0 0 70px -4px ${glow}cc, inset 0 0 40px -10px ${glow}66` : rescue ? '0 0 0 2px #F59E0B, 0 0 90px -10px #F59E0Bcc' : undefined,
      }}
    >
      {running && <div className="lane-sweep" />}
      {/* top accent */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${t.hex}, transparent)`, opacity: running ? 0.9 : 0.35 }} />
      <LaneHeader lane={lane} />
      <div className="relative flex min-h-0 flex-1 flex-col px-2.5 pt-2">
        <ShopFrame lane={lane}>
          {l.status === 'idle' && <div className="idle-shimmer" />}
          <AnimatePresence>
            {layoutFlash > 0 && (
              <motion.div key={layoutFlash} className="pointer-events-none absolute inset-0 z-10" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }}
                style={{ background: 'linear-gradient(180deg, #22D3EE33, #07080B88)' }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {l.flash && !rescue && (
              <motion.div key={l.flash} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-md border border-fail bg-[#2a0a12] px-2.5 py-0.5 font-mono text-[12px] font-bold text-fail">
                POLICY VIOLATION {l.flash}
              </motion.div>
            )}
          </AnimatePresence>
          <VerdictStamp verdict={l.verdict} k={l.verdictKey} />
          <RescueOverlay lane={lane} />
          <AnimatePresence>{l.bug && <BugReportCard key={l.verdictKey} bug={l.bug} onClose={() => patchLane(lane, { bug: undefined })} />}</AnimatePresence>
        </ShopFrame>
        {lane === 'adapted' && burst > 0 && <span key={`b${burst}`} className="pointer-events-none absolute left-1/2 top-1/2 z-30"><Burst color="#22D3EE" n={18} dist={120} /></span>}
      </div>
      {rescue ? <RescuePanel lane={lane} /> : <StepLog steps={l.steps} color={t.hex} idle={l.status === 'idle'} />}
    </motion.section>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { LaneId } from '@/lib/agent/types';
import { p50, useMission } from '@/lib/store/mission';
import { LANE_THEME } from '@/lib/store/lanes';
import { describeAction } from '@/lib/agent/loop';
import { VersionBadge } from './VersionBadge';
import { LANES } from '@/lib/agent/lanes';

function closedModel() {
  try { return LANES.closed.modelRef().model.replace(/^closed:/, '') || 'closed'; } catch { return 'closed'; }
}

function Typewriter({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, 20);
    return () => clearInterval(id);
  }, [text, reduce]);
  return <span className={className} style={style}>{text.slice(0, n)}</span>;
}

export function LaneHeader({ lane }: { lane: LaneId }) {
  const t = LANE_THEME[lane];
  const l = useMission((s) => s.lanes[lane]);
  const adapted = useMission((s) => s.adapted.label);
  const last = l.steps[l.steps.length - 1];
  const lat = p50(l.latencies);
  const version = lane === 'adapted' ? adapted : lane === 'closed' ? closedModel() : lane === 'icl' ? 'v1 + ICL' : 'v1';
  const sub = lane === 'closed' ? 'closed' : 'open';
  return (
    <div className="shrink-0 px-3 pt-2.5 2xl:pt-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: t.hex, boxShadow: `0 0 10px ${t.hex}` }} />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-white 2xl:text-[14.5px]">{t.name}</span>
        <span className="text-[12px] text-muted">· {sub}</span>
        <VersionBadge label={version} color={t.hex} live={lane === 'adapted'} />
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted 2xl:text-[12px]">
          <span><span className="text-faint">steps</span> <span className="tnum text-white/85">{l.steps.filter((s) => !s.human).length}</span></span>
          <span className="text-faint">·</span>
          <span className="tnum text-white/85">{lat === null ? '—' : `${lat}ms`}</span>
          <span className="text-faint">·</span>
          <span className="tnum text-white/85">{l.costKnown ? `$${l.costUsd.toFixed(4)}` : lane === 'closed' ? '$0.0000' : 'credits'}</span>
          {lane === 'icl' && l.promptChars > 0 && (<><span className="text-faint">·</span><span className="tnum text-icl">{(l.promptChars / 1000).toFixed(1)}k ch</span></>)}
        </span>
      </div>
      <div className="mt-1 flex h-[18px] items-center gap-2 overflow-hidden font-mono text-[11.5px] 2xl:text-[12.5px]">
        {l.thinking ? (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="inline-flex gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="h-1 w-1 rounded-full animate-pulse-slow" style={{ background: t.hex, animationDelay: `${i * 0.2}s` }} />)}</span>
            deciding via Mubit…
          </span>
        ) : last ? (
          <>
            <Typewriter key={`${last.idx}${last.human}`} text={describeAction(last.action, last.label)} className="shrink-0 truncate" style={{ color: last.human ? '#F59E0B' : t.hex }} />
            <span className="truncate font-sans text-[11.5px] text-muted">{last.action.reason}</span>
          </>
        ) : (
          <span className="truncate font-sans text-[11.5px] text-faint">{t.caption}</span>
        )}
      </div>
    </div>
  );
}

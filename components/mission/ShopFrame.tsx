'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { LaneId } from '@/lib/agent/types';
import { registerFrame } from '@/lib/store/frames';
import { useMission } from '@/lib/store/mission';
import { GhostCursor } from './GhostCursor';

const W = 1280;
const H = 800;

/** The lane's customer website: a 1280×800 iframe scaled with a transform to fit, plus the ghost cursor. */
export function ShopFrame({ lane, children }: { lane: LaneId; children?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const geom = useRef({ scale: 0.3, ox: 0, oy: 0 });
  const [g, setG] = useState({ scale: 0, ox: 0, oy: 0, w: 0, h: 0 });
  // iframe src only for first mount; subsequent changes go through retry:reset.
  const [src] = useState(() => {
    const s = useMission.getState();
    const q = new URLSearchParams({ lane, task: s.taskId, bugs: s.bugs.join(','), v: String(s.versionIndex) });
    return `/shop/${s.seed}?${q.toString()}`;
  });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const scale = Math.min(w / W, h / H);
      const ox = Math.round((w - W * scale) / 2);
      const oy = Math.round((h - H * scale) / 2);
      geom.current = { scale, ox, oy };
      setG({ scale, ox, oy, w: W * scale, h: H * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="relative min-h-0 flex-1">
      <div
        className="absolute overflow-hidden rounded-[8px] bg-[#FAFAF7] shadow-[0_0_0_1px_#ffffff14,0_12px_40px_-12px_#000]"
        style={{ left: g.ox, top: g.oy, width: g.w, height: g.h, opacity: g.scale ? 1 : 0 }}
        data-lane-frame={lane}
      >
        <iframe
          ref={(el) => registerFrame(lane, el)}
          src={src}
          title={`${lane} lane shop`}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: W, height: H, transform: `scale(${g.scale})` }}
          tabIndex={-1}
        />
        {children}
      </div>
      <GhostCursor lane={lane} geom={geom} />
    </div>
  );
}

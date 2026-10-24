'use client';
// SVG conduits from each lane converge into the breathing Mubit core. Particles are driven by a single
// rAF loop that writes SVG attributes directly (no React renders per frame).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LaneId } from '@/lib/agent/types';
import { useMission } from '@/lib/store/mission';
import { LANE_THEME } from '@/lib/store/lanes';
import { on } from '@/lib/store/bus';
import { play } from '@/lib/store/sfx';

const GAP = 12;
const HEX = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

export function laneCenters(width: number, n: number) {
  const col = (width - GAP * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => i * (col + GAP) + col / 2);
}

function conduitPath(x: number, cx: number, cy: number, h: number, r: number) {
  const dx = x - cx;
  if (Math.abs(dx) < 40) return `M ${x} ${h} C ${x} ${h - 10}, ${cx} ${cy + r + 14}, ${cx} ${cy + r * 0.86}`;
  const s = Math.sign(dx);
  const ex = cx + s * r * 0.98;
  return `M ${x} ${h} C ${x} ${cy + 4}, ${ex + s * Math.min(140, Math.abs(dx) * 0.35)} ${cy}, ${ex} ${cy}`;
}

export function MubitPipe() {
  const iclOn = useMission((s) => s.iclOn);
  const lanes: LaneId[] = iclOn ? ['closed', 'base', 'adapted', 'icl'] : ['closed', 'base', 'adapted'];
  const calls = useMission((s) => s.calls);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 80 });
  const [cols, setCols] = useState<number[] | null>(null);
  const pathRefs = useRef<Partial<Record<LaneId, SVGPathElement | null>>>({});
  const layer = useRef<SVGGElement>(null);
  const coreRef = useRef<SVGGElement>(null);
  const [bursts, setBursts] = useState<number[]>([]);
  // A correction card reaches the core ~1.8s after lift-off (FlyingCards timeline): amber + orange shockwaves.
  useEffect(() => on('card', () => {
    const id = Date.now() + Math.random();
    setTimeout(() => setBursts((b) => [...b, id]), 1750);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 2900);
  }), []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-lane-col]'));
      setCols(nodes.length ? nodes.map((n) => { const b = n.getBoundingClientRect(); return b.left - r.left + b.width / 2; }) : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = setTimeout(measure, 120);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [lanes.length]);

  // particle engine
  useEffect(() => {
    type P = { lane: LaneId; t0: number; dur: number; el: SVGCircleElement; halo: SVGCircleElement; flashed: boolean };
    const ps: P[] = [];
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flashCore = () => {
      const c = coreRef.current;
      if (!c) return;
      c.classList.remove('core-flash');
      void (c as unknown as HTMLElement).getBoundingClientRect();
      c.classList.add('core-flash');
      play('tick');
    };
    const tick = (now: number) => {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        const path = pathRefs.current[p.lane];
        const k = (now - p.t0) / p.dur; // 0..2 : out and back
        if (!path || k >= 2) { p.el.remove(); p.halo.remove(); ps.splice(i, 1); continue; }
        const len = path.getTotalLength();
        const along = k < 1 ? easeInOut(k) : 1 - easeInOut(k - 1);
        if (k >= 1 && !p.flashed) { p.flashed = true; flashCore(); }
        const pt = path.getPointAtLength(len * along);
        p.el.setAttribute('cx', pt.x.toFixed(1)); p.el.setAttribute('cy', pt.y.toFixed(1));
        p.halo.setAttribute('cx', pt.x.toFixed(1)); p.halo.setAttribute('cy', pt.y.toFixed(1));
        const op = k < 0.05 ? k / 0.05 : k > 1.9 ? (2 - k) / 0.1 : 1;
        p.el.setAttribute('opacity', op.toFixed(2)); p.halo.setAttribute('opacity', (op * 0.35).toFixed(2));
      }
      raf = ps.length ? requestAnimationFrame(tick) : 0;
    };
    const off = on('call', ({ lane, ms }) => {
      if (reduce) { flashCore(); return; }
      const g = layer.current;
      if (!g) return;
      const color = LANE_THEME[lane].hex;
      const ns = 'http://www.w3.org/2000/svg';
      const halo = document.createElementNS(ns, 'circle');
      halo.setAttribute('r', '9'); halo.setAttribute('fill', color); halo.setAttribute('opacity', '0');
      halo.setAttribute('filter', 'url(#pblur)');
      const el = document.createElementNS(ns, 'circle');
      el.setAttribute('r', '3'); el.setAttribute('fill', '#fff'); el.setAttribute('stroke', color); el.setAttribute('stroke-width', '2'); el.setAttribute('opacity', '0');
      g.appendChild(halo); g.appendChild(el);
      ps.push({ lane, t0: performance.now(), dur: Math.min(1500, Math.max(250, ms / 2)), el, halo, flashed: false });
      if (!raf) raf = requestAnimationFrame(tick);
    });
    return () => { off(); cancelAnimationFrame(raf); ps.forEach((p) => { p.el.remove(); p.halo.remove(); }); };
  }, []);

  const { w, h } = size;
  const cx = w / 2;
  const cy = h * 0.46;
  const r = Math.min(30, h * 0.32);
  const xs = cols && cols.length === lanes.length ? cols : laneCenters(w - 32, lanes.length).map((x) => x + 16);

  return (
    <div ref={wrap} className="relative h-[64px] shrink-0 2xl:h-[96px]" style={{ contain: 'layout paint' }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" width={w} height={h} aria-hidden>
        <defs>
          <filter id="pblur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="coreglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8" /></filter>
          <radialGradient id="coregrad" cx="50%" cy="38%" r="70%">
            <stop offset="0" stopColor="#FFB27A" />
            <stop offset="0.45" stopColor="#FF5A14" />
            <stop offset="1" stopColor="#B32600" />
          </radialGradient>
          <linearGradient id="hline" x1="0" x2="1">
            <stop offset="0" stopColor="#FF4500" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FF4500" stopOpacity="0.35" />
            <stop offset="1" stopColor="#FF4500" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g>
          <line x1={0} x2={w} y1={cy} y2={cy} stroke="url(#hline)" strokeWidth="1" />
          {lanes.map((lane, i) => {
            const d = conduitPath(xs[i], cx, cy, h, r);
            const c = LANE_THEME[lane].hex;
            return (
              <g key={lane}>
                <path d={d} stroke={c} strokeOpacity="0.12" strokeWidth="6" fill="none" />
                <path ref={(el) => { pathRefs.current[lane] = el; }} d={d} stroke={c} strokeOpacity="0.32" strokeWidth="1.5" fill="none" />
                <path d={d} stroke={c} strokeOpacity="0.7" strokeWidth="1.5" fill="none" className="conduit-flow" />
              </g>
            );
          })}
        </g>
        <g ref={layer} />
        <g ref={coreRef} className="mubit-core" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <polygon points={HEX(cx, cy, r * 1.25)} fill="#FF4500" opacity="0.45" filter="url(#coreglow)" className="core-halo" />
          <circle cx={cx} cy={cy} r={r * 1.55} fill="none" stroke="#FF6A2B" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 7" className="core-ring" />
          <circle cx={cx} cy={cy} r={r * 1.85} fill="none" stroke="#FFB27A" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="18 10 4 10" className="core-ring rev" />
          <polygon points={HEX(cx, cy, r * 1.32)} fill="none" stroke="#FF4500" strokeOpacity="0.35" strokeWidth="1" className="core-ring rev" />
          {bursts.map((b) => (
            <g key={b}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F59E0B" strokeWidth="3" className="core-burst" />
              <polygon points={HEX(cx, cy, r)} fill="#FF4500" fillOpacity="0.25" stroke="#FFC9A8" strokeWidth="2" className="core-burst" style={{ animationDelay: '.12s' }} />
            </g>
          ))}
          <g className="animate-breathe" style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box' }}>
            <polygon points={HEX(cx, cy, r)} fill="url(#coregrad)" stroke="#FFC9A8" strokeOpacity="0.7" strokeWidth="1" />
            <polygon points={HEX(cx, cy, r * 0.62)} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
            <circle cx={cx} cy={cy} r={r * 0.18} fill="#fff" />
          </g>
        </g>
      </svg>
      <div id="mubit-core" className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: cy, width: r * 2, height: r * 2 }} />
      <div className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-2 rounded-full border border-mubit/25 bg-[#0b0806]/90 py-[3px] pl-2.5 pr-3 shadow-[0_0_24px_-6px_#FF450066]" style={{ left: cx + r * 1.55, top: cy }}>
        <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-mubit 2xl:text-[12px]">MUBIT</span>
        <span className="h-3 w-px bg-mubit/30" />
        <span className="tnum font-mono text-[11.5px] text-white/85 2xl:text-[12.5px]">{calls.toLocaleString('en-GB')} <span className="text-muted">calls routed</span></span>
      </div>
      <div className="pointer-events-none absolute -translate-y-1/2 rounded-full bg-bg/90 px-2.5 py-[3px]" style={{ right: w - cx + r * 1.55, top: cy }}>
        <span className="text-[11px] text-muted 2xl:text-[12px]">Every model call is routed through Mubit <span className="text-mubit">→</span></span>
      </div>
    </div>
  );
}

function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

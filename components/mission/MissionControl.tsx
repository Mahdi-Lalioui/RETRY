'use client';
import { useEffect } from 'react';
import { LayoutGroup } from 'motion/react';
import { useMission } from '@/lib/store/mission';
import { boot } from '@/lib/agent/loop';
import type { LaneId } from '@/lib/agent/types';
import { TopBar } from './TopBar';
import { ReplayBanner } from './ReplayBanner';
import { MubitPipe } from './MubitPipe';
import { Lane } from './Lane';
import { CorrectionTray } from './CorrectionTray';
import { TrainingRing } from './TrainingRing';
import { Scoreboard } from './Scoreboard';
import { ControlDeck } from './ControlDeck';
import { FlyingCards } from './FlyingCards';
import { Hotkeys } from './Hotkeys';

export function MissionControl() {
  const iclOn = useMission((s) => s.iclOn);
  const lanes: LaneId[] = iclOn ? ['closed', 'base', 'adapted', 'icl'] : ['closed', 'base', 'adapted'];
  useEffect(() => { void boot(); }, []);
  return (
    <main className="relative flex h-dvh w-screen flex-col overflow-clip">
      <TopBar />
      <ReplayBanner />
      <div className="flex min-h-0 flex-1 flex-col px-4 2xl:px-6">
        <MubitPipe />
        <LayoutGroup>
          <div
            className="grid min-h-0 shrink-0 gap-3"
            style={{
              gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))`,
              // lane height follows the 16:10 shop at full column width, capped so the bottom row keeps ≥ ~190px
              height: `min(calc((100vw - 48px - ${(lanes.length - 1) * 12}px) / ${lanes.length} * 0.625 + 112px), calc(100dvh - 400px))`,
            }}
          >
            {lanes.map((l) => <Lane key={l} lane={l} />)}
          </div>
        </LayoutGroup>
        <div className="mt-3 grid min-h-[150px] flex-1 gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,0.95fr) minmax(0,1.75fr)' }}>
          <CorrectionTray />
          <TrainingRing />
          <Scoreboard />
        </div>
        <div className="h-[60px] shrink-0 2xl:h-[68px]" />
      </div>
      <ControlDeck />
      <FlyingCards />
      <Hotkeys />
    </main>
  );
}

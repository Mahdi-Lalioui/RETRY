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
import { StoryStrip } from './StoryStrip';
import { HowMubit } from './HowMubit';
import { IdleHero } from './IdleHero';
import { PromotionFX } from './PromotionFX';
import { JudgeIntro } from './JudgeIntro';
import { BugDrop } from './BugDrop';
import { Presenter } from './Presenter';

export function MissionControl() {
  const iclOn = useMission((s) => s.iclOn);
  // The lane deck sits slightly tilted in 3D while idle and straightens as soon as anything runs.
  const active = useMission((s) => s.running || !!s.rescue || Object.values(s.lanes).some((l) => l.steps.length > 0));
  // On short screens (laptops at 125–150% scaling) a rescue needs a bigger shop, so the bottom row yields height.
  const rescueOn = useMission((s) => !!s.rescue);
  const lanes: LaneId[] = iclOn ? ['closed', 'base', 'adapted', 'icl'] : ['closed', 'base', 'adapted'];
  useEffect(() => { void boot(); }, []);
  return (
    <main className="relative flex h-dvh w-screen flex-col overflow-clip">
      <div className="grid-parallax" aria-hidden />
      <TopBar />
      <ReplayBanner />
      <div className="relative flex min-h-0 flex-1 flex-col px-4 2xl:px-6">
        <MubitPipe />
        <LayoutGroup>
          <div className="deck-stage relative shrink-0">
            <div
              className={`deck grid min-h-0 gap-3 ${active ? 'deck-flat' : 'deck-tilt'}`}
              style={{
                gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))`,
                // lane height follows the 16:10 shop at full column width, capped so the bottom row keeps room
                height: `min(calc((100vw - 48px - ${(lanes.length - 1) * 12}px) / ${lanes.length} * 0.625 + 112px), calc(100dvh - ${rescueOn ? 300 : 425}px))`,
                transition: 'height 0.35s ease',
              }}
            >
              {lanes.map((l) => <Lane key={l} lane={l} />)}
            </div>
            <IdleHero />
            <PromotionFX />
            <JudgeIntro />
            <BugDrop />
          </div>
        </LayoutGroup>
        <StoryStrip />
        <div className={`mt-2.5 grid flex-1 gap-3 ${rescueOn ? 'min-h-0 overflow-clip' : 'min-h-[140px]'}`} style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,0.95fr) minmax(0,1.75fr)' }}>
          <CorrectionTray />
          <TrainingRing />
          <Scoreboard />
        </div>
        <div className="h-[60px] shrink-0 2xl:h-[68px]" />
      </div>
      <ControlDeck />
      <FlyingCards />
      <Hotkeys />
      <HowMubit />
      <Presenter />
    </main>
  );
}

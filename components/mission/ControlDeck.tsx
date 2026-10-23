'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Bug, ChevronDown, Dices, HeartPulse, Layers, MonitorPlay, Play, RefreshCw, Rocket, Square, Volume2, VolumeX } from 'lucide-react';
import type { BugId } from '@/lib/shop/state';
import { useMission } from '@/lib/store/mission';
import { TASKS } from '@/lib/shop/tasks';
import { breakCheckout, heal, judgesTurn, runAll, setTask, shipNewVersion, stopAll, toggleDemo, toggleIcl, trainNow } from '@/lib/agent/loop';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Tooltip } from '@/components/ui/Tooltip';

export const BUGS: { id: BugId; label: string; hint: string }[] = [
  { id: 'total_nan', label: 'Total shows £NaN', hint: 'after coupon/shipping' },
  { id: 'pay_button_dead', label: 'Pay button dead', hint: 'clicking pay does nothing' },
  { id: 'no_order_id', label: 'No order number', hint: 'confirmation lacks NM- id' },
  { id: 'coupon_500', label: 'Coupon → 500', hint: 'any coupon crashes' },
];

function DeckBtn({ icon, label, k, onClick, variant, active, tip, always }: { icon: React.ReactNode; label: string; k: string; onClick: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'learn'; active?: boolean; tip?: string; always?: boolean }) {
  return (
    <Tooltip label={tip ?? label}>
      <Button variant={variant ?? 'ghost'} active={active} onClick={onClick}>
        {icon}<span className={always ? '' : 'hidden 2xl:inline'}>{label}</span><Kbd className={variant === 'primary' ? 'border-black/20 bg-black/10 text-black/70' : ''}>{k}</Kbd>
      </Button>
    </Tooltip>
  );
}

export function ControlDeck() {
  const running = useMission((s) => s.running);
  const iclOn = useMission((s) => s.iclOn);
  const mode = useMission((s) => s.mode);
  const sound = useMission((s) => s.sound);
  const bugs = useMission((s) => s.bugs);
  const taskId = useMission((s) => s.taskId);
  const breakMenu = useMission((s) => s.breakMenu);
  const phase = useMission((s) => s.training.phase);
  const anyActivity = useMission((s) => Object.values(s.lanes).some((l) => l.status !== 'idle'));
  const set = useMission((s) => s.set);
  const ic = 'h-3.5 w-3.5';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 2xl:bottom-4">
      <div className="glass pointer-events-auto relative flex items-center gap-0.5 rounded-[14px] p-1.5">
        {running ? (
          <DeckBtn icon={<Square className={ic} fill="currentColor" />} label="Stop" k="Esc" onClick={stopAll} variant="danger" tip="Abort all lanes" always />
        ) : (
          <span className="relative">
            {!anyActivity && <span className="pointer-events-none absolute -inset-1 rounded-[11px] bg-white/20 blur-md animate-pulse-slow" />}
            <DeckBtn icon={<Play className={ic} fill="currentColor" />} label="Run all" k="R" onClick={() => void runAll()} variant="primary" tip="Run every lane on the current ticket" always />
          </span>
        )}
        <DeckBtn icon={<Dices className={ic} />} label="Judge's turn" k="J" onClick={() => void judgesTurn()} tip="Random unseen seed ≥10000, random ticket, 30% bug chance" always />
        <span className="mx-1 h-5 w-px bg-white/10" />
        <DeckBtn icon={<Rocket className={ic} />} label="Ship new version" k="S" onClick={shipNewVersion} tip="Reshuffle the site: new unseen layout" />
        <span className="relative">
          <DeckBtn icon={<Bug className={ic} />} label={bugs.length ? 'Broken' : 'Break checkout'} k="B" onClick={() => set({ breakMenu: !breakMenu })} variant={bugs.length ? 'danger' : 'ghost'} active={breakMenu} tip="Inject a real regression" />
          <AnimatePresence>
            {breakMenu && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
                className="absolute bottom-[calc(100%+10px)] left-0 w-[240px] rounded-[12px] border border-white/10 bg-[#12161E]/98 p-1 shadow-[0_20px_60px_-10px_#000]">
                {BUGS.map((b, i) => (
                  <button key={b.id} onClick={() => breakCheckout(b.id)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-white/[0.07]">
                    <Kbd>{i + 1}</Kbd>
                    <span className="flex-1"><span className="block text-[12px] text-white">{b.label}</span><span className="block text-[10.5px] text-muted">{b.hint}</span></span>
                    {bugs.includes(b.id) && <span className="h-1.5 w-1.5 rounded-full bg-fail" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </span>
        <DeckBtn icon={<HeartPulse className={ic} />} label="Heal" k="H" onClick={heal} tip="Clear all injected bugs" />
        <span className="mx-1 h-5 w-px bg-white/10" />
        <DeckBtn icon={<RefreshCw className={`${ic} ${phase === 'training' ? 'animate-spin' : ''}`} />} label="Train now" k="T" onClick={() => void trainNow()} variant={phase === 'ready' ? 'learn' : 'ghost'} tip="Ask Mubit to build the next version" />
        <DeckBtn icon={<Layers className={ic} />} label="ICL lane" k="I" onClick={toggleIcl} active={iclOn} tip="Add a lane that stuffs corrections into the prompt" />
        <DeckBtn icon={<MonitorPlay className={ic} />} label={mode === 'replay' ? 'Replay' : 'Demo'} k="D" onClick={toggleDemo} active={mode === 'replay'} tip="Toggle recorded replay" />
        <Tooltip label={sound ? 'Mute (M)' : 'Sound on (M)'}>
          <Button onClick={() => set({ sound: !sound })} aria-label="Toggle sound">{sound ? <Volume2 className={ic} /> : <VolumeX className={ic} />}</Button>
        </Tooltip>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <label className="relative inline-flex h-8 items-center gap-1 rounded-[9px] border border-white/10 bg-white/[0.04] pl-2 pr-6 text-[12px] text-white/85 hover:bg-white/[0.07]">
          <span className="font-mono text-[11px] text-muted">ticket</span>
          <select value={taskId} style={{ maxWidth: 'clamp(120px, 14vw, 300px)' }} onChange={(e) => setTask(e.target.value)} className="cursor-pointer appearance-none bg-transparent font-mono text-[12px] text-white outline-none" aria-label="Task">
            {TASKS.map((t) => <option key={t.id} value={t.id} className="bg-[#12161E]">{t.id} · {t.goal.slice(0, 42)}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-muted" />
        </label>
      </div>
    </div>
  );
}

'use client';
import { useEffect } from 'react';
import { useMission } from '@/lib/store/mission';
import { breakCheckout, heal, runAll, shipNewVersion, stopAll, toggleDemo, toggleIcl, trainNow } from '@/lib/agent/loop';
import { BUGS } from './ControlDeck';
import { judgeWithIntro } from './judge';
import { setPresenter } from './Presenter';

/** R J S B H T I Esc D M (plan §14.3). Rescue keys (Enter/Esc/1-7) are captured first by RescueOverlay. */
export function Hotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const s = useMission.getState();
      if (s.breakMenu && /^[1-4]$/.test(e.key)) { breakCheckout(BUGS[Number(e.key) - 1].id); return; }
      switch (e.key.toLowerCase()) {
        case 'r': e.preventDefault(); void runAll(); break;
        case 'j': e.preventDefault(); void judgeWithIntro(); break;
        case 's': e.preventDefault(); shipNewVersion(); break;
        case 'b': e.preventDefault(); s.set({ breakMenu: !s.breakMenu }); break;
        case 'h': e.preventDefault(); heal(); break;
        case 't': e.preventDefault(); void trainNow(); break;
        case 'i': e.preventDefault(); toggleIcl(); break;
        case 'd': e.preventDefault(); toggleDemo(); break;
        case 'p': e.preventDefault(); setPresenter(!document.documentElement.classList.contains('presenter')); break;
        case 'm': e.preventDefault(); s.set({ sound: !s.sound }); break;
        case 'escape':
          if (s.breakMenu) { s.set({ breakMenu: false }); break; }
          stopAll(); break;
      }
    };
    // A click inside a lane's shop moves keyboard focus into that iframe; pull it back so hotkeys keep working.
    const onBlur = () => setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') (a as HTMLElement).blur();
    }, 0);
    const poll = setInterval(onBlur, 400);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => { clearInterval(poll); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); };
  }, []);
  return null;
}

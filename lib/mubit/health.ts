// [G] Per-instance record of the real Mubit client's last outcome, so /api/health can report "down" after failures
// (the pill then reads MUBIT UNREACHABLE) and recover on the next success. Never stores secrets.
const h = { lastOkAt: 0, lastErrAt: 0, lastError: '' };

export function noteMubit(ok: boolean, err?: unknown) {
  if (ok) h.lastOkAt = Date.now();
  else { h.lastErrAt = Date.now(); h.lastError = redact(err instanceof Error ? err.message : String(err ?? 'error')); }
}

/** 'down' when the most recent call failed within the window. */
export function mubitReachability(windowMs = 60_000): { down: boolean; lastError?: string } {
  const down = h.lastErrAt > h.lastOkAt && Date.now() - h.lastErrAt < windowMs;
  return down ? { down, lastError: h.lastError } : { down };
}

export function redact(s: string): string {
  return s.replace(/(sk-|mbt_)[A-Za-z0-9_\-]+/g, '$1…').replace(/Bearer\s+\S+/gi, 'Bearer …').slice(0, 200);
}

export function resetMubitHealth() { h.lastOkAt = 0; h.lastErrAt = 0; h.lastError = ''; }

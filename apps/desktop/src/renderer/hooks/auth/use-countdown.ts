import { useEffect, useState } from 'react';

/**
 * Milliseconds remaining until `untilMs` (an epoch instant), re-evaluated every
 * second and clamped at zero. It reaches exactly 0 once the instant passes, which
 * lets a locked control re-enable itself without another IPC call. Restarts its
 * ticker whenever `untilMs` changes (e.g. a fresh lockout window).
 */
export function useCountdown(untilMs: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, untilMs - Date.now()));

  useEffect(() => {
    setRemaining(Math.max(0, untilMs - Date.now()));
    if (untilMs <= Date.now()) return;

    const id = setInterval(() => {
      const next = Math.max(0, untilMs - Date.now());
      setRemaining(next);
      if (next === 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [untilMs]);

  return remaining;
}

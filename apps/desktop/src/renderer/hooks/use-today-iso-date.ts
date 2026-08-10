import { useEffect, useState } from 'react';
import { todayIsoDate } from '../lib/center-hours-overrides/dates';

function millisUntilNextLocalMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
}

/**
 * The current local civil date ('YYYY-MM-DD'). A page left mounted across local
 * midnight (the planner open overnight) would otherwise pin the mount-day's date
 * and keep yesterday's override-aware range and closed segments until remounted
 * (SOU-165). A timer to the next local midnight advances it even on a kiosk that
 * never loses focus; the focus / visibility listeners are a cheap backstop for
 * sleep-wake and clock jumps that can throttle background timers.
 */
export function useTodayIsoDate(): string {
  const [today, setToday] = useState(todayIsoDate);
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const sync = () => setToday((previous) => {
      const current = todayIsoDate();
      return current === previous ? previous : current;
    });
    const scheduleMidnight = () => {
      midnightTimer = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, millisUntilNextLocalMidnight());
    };
    scheduleMidnight();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(midnightTimer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return today;
}

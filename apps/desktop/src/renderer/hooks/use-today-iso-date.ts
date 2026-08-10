import { useEffect, useState } from 'react';
import { todayIsoDate } from '../lib/center-hours-overrides/dates';

/**
 * The current local civil date ('YYYY-MM-DD'), recomputed when the window regains
 * focus or becomes visible. A page left mounted across local midnight (the planner
 * open overnight) would otherwise pin the mount-day's date and keep yesterday's
 * override-aware range and closed segments until remounted (SOU-165).
 */
export function useTodayIsoDate(): string {
  const [today, setToday] = useState(todayIsoDate);
  useEffect(() => {
    const refresh = () => setToday((previous) => {
      const current = todayIsoDate();
      return current === previous ? previous : current;
    });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

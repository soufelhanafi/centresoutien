import type { Clock } from '../../../src/ports/clock';

/** Deterministic clock for tests. `advance` moves time forward. */
export function fakeClock(iso = '2026-07-28T10:00:00Z'): Clock & { advance: (ms: number) => void } {
  let current = new Date(iso);
  return {
    now: () => current,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

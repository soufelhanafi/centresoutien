import { toMinutes, type TimeOfDay } from '@centresoutien/domain';

export type LanedSession<T> = T & {
  readonly lane: number;
  readonly laneCount: number;
};

/**
 * Classic greedy interval partitioning, applied per weekday: two sessions whose
 * `[start, end)` overlap (different rooms booked at the same hour, both feeding
 * the same day column) get distinct side-by-side `lane`s instead of stacking on
 * top of each other; sessions that never overlap any other share lane 0.
 * `laneCount` is the day's total lane width the block drawer divides by, so a
 * quiet day still renders full-width blocks. Caller groups `sessions` by
 * `dayOfWeek` first — lanes never span across days.
 */
export function assignLanes<T extends { readonly start: TimeOfDay; readonly end: TimeOfDay }>(
  sessions: readonly T[],
): readonly LanedSession<T>[] {
  const sorted = [...sessions].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const laneEndMinutes: number[] = [];
  const withLane: (T & { readonly lane: number })[] = [];

  for (const session of sorted) {
    const startMinutes = toMinutes(session.start);
    const freeLane = laneEndMinutes.findIndex((endMinutes) => endMinutes <= startMinutes);
    const lane = freeLane === -1 ? laneEndMinutes.length : freeLane;
    laneEndMinutes[lane] = toMinutes(session.end);
    withLane.push({ ...session, lane });
  }

  const laneCount = laneEndMinutes.length;
  return withLane.map((session) => ({ ...session, laneCount }));
}

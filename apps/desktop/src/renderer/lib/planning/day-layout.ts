import type { PlannerSessionView } from './planner-view';
import { timeToMinutes } from './time-range';

/** A session with its horizontal placement when several overlap in a day. */
export type LaidOutSession = {
  readonly session: PlannerSessionView;
  /** 0-based column within its overlap cluster. */
  readonly lane: number;
  /** Total columns the cluster splits into (block width = column ÷ `lanes`). */
  readonly lanes: number;
};

/**
 * Packs a single day's sessions into side-by-side lanes so overlapping sessions
 * (e.g. two rooms at 09:00) never hide each other. Standard interval
 * partitioning: sweep by start time, reuse the first lane whose previous session
 * has ended, and split every session in an overlap cluster into the same number
 * of columns. Non-overlapping sessions stay full width (`lanes: 1`).
 */
export function layoutDaySessions(sessions: readonly PlannerSessionView[]): readonly LaidOutSession[] {
  const sorted = [...sessions].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end),
  );

  const out: { session: PlannerSessionView; lane: number; lanes: number }[] = [];
  const laneEnds: number[] = [];
  let clusterStart = 0;
  let clusterMaxEnd = -1;

  const closeCluster = (upTo: number) => {
    const lanes = laneEnds.length;
    for (let i = clusterStart; i < upTo; i += 1) {
      const entry = out[i];
      if (entry) entry.lanes = lanes;
    }
    laneEnds.length = 0;
    clusterMaxEnd = -1;
    clusterStart = upTo;
  };

  for (const session of sorted) {
    const start = timeToMinutes(session.start);
    const end = timeToMinutes(session.end);

    // A gap with no overlap closes the previous cluster and starts a new one.
    if (laneEnds.length > 0 && start >= clusterMaxEnd) closeCluster(out.length);

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    clusterMaxEnd = Math.max(clusterMaxEnd, end);
    out.push({ session, lane, lanes: 1 });
  }

  if (laneEnds.length > 0) closeCluster(out.length);
  return out;
}

import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { layoutDaySessions } from '../../lib/planning/day-layout';
import { blockPosition, type TimeRange } from '../../lib/planning/time-range';
import { SessionBlock } from './session-block';

type PlannerDayColumnProps = {
  sessions: readonly PlannerSessionView[];
  range: TimeRange;
  /** Pixel height of one hour, shared with the gutter so rows align. */
  hourPx: number;
  onSelect: (session: PlannerSessionView) => void;
};

/**
 * One weekday column: a relative box whose hour gridlines are a theme-aware
 * repeating gradient, with each session absolutely positioned by time (top /
 * height) and by lane (inline-start / width) so overlaps sit side by side. The
 * grid mirrors the whole row of columns in RTL via `dir` — this column never
 * flips anything itself.
 */
export function PlannerDayColumn({ sessions, range, hourPx, onSelect }: PlannerDayColumnProps) {
  const height = (range.endHour - range.startHour) * hourPx;
  const laidOut = layoutDaySessions(sessions);

  return (
    <div
      className="relative border-s border-border"
      style={{
        height,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${hourPx - 1}px, var(--border) ${hourPx - 1}px, var(--border) ${hourPx}px)`,
      }}
    >
      {laidOut.map(({ session, lane, lanes }) => {
        const { topPercent, heightPercent } = blockPosition(session, range);
        const widthPct = 100 / lanes;
        return (
          <SessionBlock
            key={session.id}
            session={session}
            onSelect={onSelect}
            style={{
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              insetInlineStart: `calc(${lane * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
            }}
          />
        );
      })}
    </div>
  );
}

import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { layoutDaySessions } from '../../lib/planning/day-layout';
import { blockPosition, type TimeRange } from '../../lib/planning/time-range';
import { SessionBlock } from './session-block';

type PlannerDayColumnProps = {
  sessions: readonly PlannerSessionView[];
  range: TimeRange;
  /** Pixel height of one hour, shared with the gutter so rows align. */
  hourPx: number;
  /** Closed days render hatched, aria-hidden, and drop their session blocks. */
  closed: boolean;
  onSelect: (session: PlannerSessionView) => void;
};

/**
 * One weekday column: a relative box whose hour gridlines are a theme-aware
 * repeating gradient, with each session absolutely positioned by time (top /
 * height) and by lane (inline-start / width) so overlaps sit side by side. The
 * grid mirrors the whole row of columns in RTL via `dir` — this column never
 * flips anything itself. A closed day swaps the gridlines for a direction-neutral
 * diagonal hatch and renders nothing interactive (SOU-184).
 */
export function PlannerDayColumn({ sessions, range, hourPx, closed, onSelect }: PlannerDayColumnProps) {
  const height = (range.endHour - range.startHour) * hourPx;

  if (closed) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none relative border-s border-border"
        style={{
          height,
          backgroundColor: 'var(--muted)',
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 6px, var(--border) 6px, var(--border) 12px)',
        }}
      />
    );
  }

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

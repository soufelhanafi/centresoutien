import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { layoutDaySessions } from '../../lib/planning/day-layout';
import { blockPosition, segmentPosition, type MinuteInterval, type TimeRange } from '../../lib/planning/time-range';
import { isFullyClosed } from '../../lib/center-hours-overrides/planner-closures';
import { SessionBlock } from './session-block';

type PlannerDayColumnProps = {
  sessions: readonly PlannerSessionView[];
  range: TimeRange;
  /** Pixel height of one hour, shared with the gutter so rows align. */
  hourPx: number;
  /** Closed intervals to hatch: whole column when fully closed, gaps under an override (SOU-165). */
  closedSegments: readonly MinuteInterval[];
  onSelect: (session: PlannerSessionView) => void;
};

/** Direction-neutral diagonal hatch for closed time, theme-aware via CSS vars. */
const CLOSED_HATCH =
  'repeating-linear-gradient(45deg, transparent, transparent 6px, var(--border) 6px, var(--border) 12px)';

/**
 * One weekday column: a relative box whose hour gridlines are a theme-aware
 * repeating gradient, with each session absolutely positioned by time (top /
 * height) and by lane (inline-start / width) so overlaps sit side by side. The
 * grid mirrors the whole row of columns in RTL via `dir` — this column never
 * flips anything itself.
 *
 * Closed time is hatched: a fully closed day swaps its gridlines for the hatch
 * and renders nothing interactive; a day open only part of the period (a dated
 * override, incl. a mid-day iftar break) keeps its gridlines and sessions and
 * overlays a hatch on each closed interval (SOU-165, SOU-184).
 */
export function PlannerDayColumn({ sessions, range, hourPx, closedSegments, onSelect }: PlannerDayColumnProps) {
  const height = (range.endHour - range.startHour) * hourPx;

  if (isFullyClosed(closedSegments, range)) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none relative border-s border-border"
        style={{ height, backgroundColor: 'var(--muted)', backgroundImage: CLOSED_HATCH }}
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
      {closedSegments.map((segment) => {
        const { topPercent, heightPercent } = segmentPosition(segment, range);
        return (
          <div
            key={`${segment.start}-${segment.end}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0"
            style={{
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              backgroundColor: 'var(--muted)',
              backgroundImage: CLOSED_HATCH,
            }}
          />
        );
      })}
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

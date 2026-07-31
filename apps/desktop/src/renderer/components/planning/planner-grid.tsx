import { useTranslation } from 'react-i18next';
import { WEEKDAYS, type WeekdayIndex } from '@centresoutien/domain';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import type { TimeRange } from '../../lib/planning/time-range';
import { PlannerDayColumn } from './planner-day-column';

/** One hour of the day occupies this many pixels; gutter and columns share it. */
const HOUR_PX = 56;
const GRID_COLUMNS = '3.5rem repeat(7, minmax(0, 1fr))';

type PlannerGridProps = {
  /** Already-filtered sessions to render. */
  sessions: readonly PlannerSessionView[];
  /** Vertical window, derived from the whole week so the grid stays stable while filtering. */
  range: TimeRange;
  onSelect: (session: PlannerSessionView) => void;
  /** Shown centered over the grid when `sessions` is empty (week-empty vs no-match copy). */
  emptyLabel: string;
};

/** `8` → `'08:00'`. */
function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function groupByDay(sessions: readonly PlannerSessionView[]): Map<WeekdayIndex, PlannerSessionView[]> {
  const byDay = new Map<WeekdayIndex, PlannerSessionView[]>();
  for (const s of sessions) {
    const bucket = byDay.get(s.dayOfWeek);
    if (bucket) bucket.push(s);
    else byDay.set(s.dayOfWeek, [s]);
  }
  return byDay;
}

/**
 * The weekly planner grid: a sticky header of day names, an hour gutter, and
 * seven day columns. Column order is the domain's canonical Sunday-first
 * `WEEKDAYS`; RTL mirroring (Sunday on the right, headers flipped) is done once
 * by `dir="rtl"` on `<html>`, never by reversing the array here (CLAUDE.md §8).
 */
export function PlannerGrid({ sessions, range, onSelect, emptyLabel }: PlannerGridProps) {
  const { t } = useTranslation();
  const byDay = groupByDay(sessions);
  const bodyHeight = (range.endHour - range.startHour) * HOUR_PX;

  return (
    <div className="relative overflow-auto rounded-xl border border-border bg-card">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {/* Header row: corner + seven day names. */}
        <div className="sticky top-0 z-10 border-b border-border bg-card" />
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="sticky top-0 z-10 border-b border-s border-border bg-card px-2 py-2 text-center text-sm font-semibold text-foreground"
          >
            {t(`planning.weekdays.${day}`)}
          </div>
        ))}

        {/* Body row: hour gutter + seven day columns (same height, so rows align). */}
        <div className="relative" style={{ height: bodyHeight }}>
          {range.hours.map((hour) => (
            <span
              key={hour}
              className="absolute end-0 -translate-y-1/2 pe-2 text-[11px] tabular-nums text-muted-foreground"
              style={{ top: (hour - range.startHour) * HOUR_PX }}
            >
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((day) => (
          <PlannerDayColumn
            key={day}
            sessions={byDay.get(day) ?? []}
            range={range}
            hourPx={HOUR_PX}
            onSelect={onSelect}
          />
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <p className="rounded-lg border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm">
            {emptyLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}

import { describe, it, expect } from 'vitest';
import { WEEKDAYS, type WeekdayIndex, type WeekdayHoursInput } from '@centresoutien/domain';
import {
  complementWithinRange,
  deriveCenterHoursRange,
  type TimeRange,
} from '../../../src/renderer/lib/planning/time-range';
import {
  deriveClosedSegmentsByDay,
  deriveOverrideAwareRange,
  isFullyClosed,
  weekColumnDates,
  weekDateSpan,
} from '../../../src/renderer/lib/center-hours-overrides/planner-closures';
import type {
  CenterHoursOverrideView,
  HoursByWeekday,
  TimeWindow,
} from '../../../src/renderer/lib/center-hours-overrides/override-view';

function hoursRow(dayOfWeek: WeekdayIndex, open: string | null, close: string | null): WeekdayHoursInput {
  return { dayOfWeek, open, close };
}

function overrideWith(
  dateRange: { start: string; end: string },
  windowsByDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>,
  id = 'cho_test',
): CenterHoursOverrideView {
  const hoursByWeekday = {} as Record<WeekdayIndex, readonly TimeWindow[]>;
  for (const day of WEEKDAYS) hoursByWeekday[day] = windowsByDay[day] ?? [];
  return {
    id,
    dateRange,
    hoursByWeekday: hoursByWeekday as HoursByWeekday,
    archived: false,
    createdAt: '2026-02-01T00:00:00.000Z',
  };
}

/** A week whose seven columns all resolve inside a single covering override. */
const MARCH_RANGE = { start: '2026-03-01', end: '2026-03-30' } as const;
// 2026-03-09 is a Monday; its Sunday-first week (03-08 … 03-14) sits fully inside.
const insideWeek = weekColumnDates('2026-03-09');

describe('weekColumnDates', () => {
  it('pins the Sunday-first week containing the anchor date', () => {
    const dates = weekColumnDates('2026-08-10'); // Monday
    expect(dates.get(0)).toBe('2026-08-09'); // Sunday
    expect(dates.get(1)).toBe('2026-08-10'); // Monday (anchor)
    expect(dates.get(6)).toBe('2026-08-15'); // Saturday
  });

  it('returns the anchor week even when the anchor is a Sunday', () => {
    const dates = weekColumnDates('2026-08-09'); // Sunday
    expect(dates.get(0)).toBe('2026-08-09');
    expect(dates.get(6)).toBe('2026-08-15');
  });
});

describe('weekDateSpan', () => {
  it('returns the earliest and latest column dates', () => {
    expect(weekDateSpan(weekColumnDates('2026-08-10'))).toEqual({
      start: '2026-08-09',
      end: '2026-08-15',
    });
  });
});

describe('complementWithinRange', () => {
  const range: TimeRange = deriveCenterHoursRange([]); // 08:00–20:00 → 480..1200

  it('returns the whole range when there are no open windows', () => {
    expect(complementWithinRange([], range)).toEqual([{ start: 480, end: 1200 }]);
  });

  it('returns the gap between two windows plus the edges (iftar break)', () => {
    const closed = complementWithinRange(
      [
        { start: 600, end: 720 }, // 10:00–12:00
        { start: 840, end: 1080 }, // 14:00–18:00
      ],
      range,
    );
    expect(closed).toEqual([
      { start: 480, end: 600 }, // before first open
      { start: 720, end: 840 }, // the mid-day gap
      { start: 1080, end: 1200 }, // after last close
    ]);
  });

  it('sorts unordered windows before differencing', () => {
    const closed = complementWithinRange(
      [
        { start: 840, end: 1080 },
        { start: 600, end: 720 },
      ],
      range,
    );
    expect(closed).toContainEqual({ start: 720, end: 840 });
  });
});

describe('deriveOverrideAwareRange', () => {
  it('uses the base weekly hours when no override covers the week', () => {
    const range = deriveOverrideAwareRange([hoursRow(0, '09:00', '18:00')], [], insideWeek);
    expect(range.startHour).toBe(9);
    expect(range.endHour).toBe(18);
  });

  it('spans the union of the override windows across the covered week', () => {
    const override = overrideWith(MARCH_RANGE, { 1: [{ open: '21:00', close: '23:30' }] });
    const range = deriveOverrideAwareRange([], [override], insideWeek);
    expect(range.startHour).toBe(21);
    expect(range.endHour).toBe(24);
  });

  it('falls back to the base range when the override closes every day', () => {
    const override = overrideWith(MARCH_RANGE, {});
    const range = deriveOverrideAwareRange([hoursRow(0, '09:00', '18:00')], [override], insideWeek);
    expect(range.startHour).toBe(9);
    expect(range.endHour).toBe(18);
  });
});

describe('deriveClosedSegmentsByDay', () => {
  it('hatches the whole column for a base closed day and nothing for an open day', () => {
    const week = [hoursRow(0, null, null), hoursRow(1, '09:00', '18:00')];
    const range = deriveCenterHoursRange(week);
    const byDay = deriveClosedSegmentsByDay(week, [], insideWeek, range);
    expect(isFullyClosed(byDay.get(0) ?? [], range)).toBe(true);
    expect(byDay.get(1)).toEqual([]);
  });

  it('hatches only the mid-day gap for an override day with two windows', () => {
    const override = overrideWith(MARCH_RANGE, {
      1: [
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ],
    });
    const range = deriveOverrideAwareRange([], [override], insideWeek);
    const byDay = deriveClosedSegmentsByDay([], [override], insideWeek, range);
    expect(byDay.get(1)).toEqual([{ start: 720, end: 840 }]); // 12:00–14:00
  });

  it('fully closes an override day with no windows', () => {
    const override = overrideWith(MARCH_RANGE, { 1: [{ open: '09:00', close: '18:00' }] });
    const range = deriveOverrideAwareRange([], [override], insideWeek);
    const byDay = deriveClosedSegmentsByDay([], [override], insideWeek, range);
    expect(isFullyClosed(byDay.get(0) ?? [], range)).toBe(true); // Sunday empty → closed
  });
});

describe('boundary week — per-column resolution (SOU-165 reviewer #3)', () => {
  // An override that covers only the FIRST half of the visible week. The anchor is
  // Monday 2026-08-10 → columns Sunday 08-09 … Saturday 08-15. The override runs
  // 2026-08-05 … 2026-08-11, so Sun/Mon/Tue (08-09/10/11) are inside and
  // Wed..Sat (08-12 … 08-15) are outside.
  const anchor = '2026-08-10';
  const weekDates = weekColumnDates(anchor);
  const boundaryOverride = overrideWith(
    { start: '2026-08-05', end: '2026-08-11' },
    {
      1: [
        // Monday: an iftar day, 14:00–17:00 then 21:00–23:00.
        { open: '14:00', close: '17:00' },
        { open: '21:00', close: '23:00' },
      ],
    },
  );
  // Static weekly hours: every day 09:00–18:00 (drives the outside columns).
  const staticWeek = WEEKDAYS.map((day) => hoursRow(day, '09:00', '18:00'));

  const range = deriveOverrideAwareRange(staticWeek, [boundaryOverride], weekDates);
  const byDay = deriveClosedSegmentsByDay(staticWeek, [boundaryOverride], weekDates, range);

  it('spans the union of the covered override windows and the static outside days', () => {
    // Static outside days open at 09:00; Monday override closes at 23:00.
    expect(range.startHour).toBe(9);
    expect(range.endHour).toBe(23);
  });

  it('Monday (inside the override) drives its own gray-out with the iftar gap', () => {
    // Complement of [14:00–17:00, 21:00–23:00] within 09:00–23:00:
    // 09:00–14:00, 17:00–21:00 (iftar gap).
    expect(byDay.get(1)).toEqual([
      { start: 540, end: 840 }, // 09:00–14:00
      { start: 1020, end: 1260 }, // 17:00–21:00 (iftar gap)
    ]);
  });

  it('Sunday (inside but closed under the override) hatches the whole column', () => {
    // 2026-08-09 is covered by the override, which lists no Sunday windows → closed.
    expect(isFullyClosed(byDay.get(0) ?? [], range)).toBe(true);
  });

  it('Wednesday (outside the override) keeps static hours with no partial hatch', () => {
    // 2026-08-12 is outside the override → static open day → identical to today's
    // behavior: no hatch even though a sibling column widened the range to 23:00.
    expect(byDay.get(3)).toEqual([]);
  });
});

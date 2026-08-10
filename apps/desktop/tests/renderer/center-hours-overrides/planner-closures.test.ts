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
} from '../../../src/renderer/lib/center-hours-overrides/planner-closures';
import type {
  CenterHoursOverrideView,
  HoursByWeekday,
  TimeWindow,
} from '../../../src/renderer/lib/center-hours-overrides/override-view';

function hoursRow(dayOfWeek: WeekdayIndex, open: string | null, close: string | null): WeekdayHoursInput {
  return { dayOfWeek, open, close };
}

function overrideWith(windowsByDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>): CenterHoursOverrideView {
  const hoursByWeekday = {} as Record<WeekdayIndex, readonly TimeWindow[]>;
  for (const day of WEEKDAYS) hoursByWeekday[day] = windowsByDay[day] ?? [];
  return {
    id: 'cho_test',
    dateRange: { start: '2026-03-01', end: '2026-03-30' },
    hoursByWeekday: hoursByWeekday as HoursByWeekday,
    createdAt: '2026-02-01T00:00:00.000Z',
  };
}

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
  it('uses the base weekly hours when no override is active', () => {
    const range = deriveOverrideAwareRange([hoursRow(0, '09:00', '18:00')], null);
    expect(range.startHour).toBe(9);
    expect(range.endHour).toBe(18);
  });

  it('spans the union of the override windows across the week', () => {
    const range = deriveOverrideAwareRange([], overrideWith({ 1: [{ open: '21:00', close: '23:30' }] }));
    expect(range.startHour).toBe(21);
    expect(range.endHour).toBe(24);
  });

  it('falls back to the base range when the override closes every day', () => {
    const range = deriveOverrideAwareRange([hoursRow(0, '09:00', '18:00')], overrideWith({}));
    expect(range.startHour).toBe(9);
    expect(range.endHour).toBe(18);
  });
});

describe('deriveClosedSegmentsByDay', () => {
  it('hatches the whole column for a base closed day and nothing for an open day', () => {
    const week = [hoursRow(0, null, null), hoursRow(1, '09:00', '18:00')];
    const range = deriveCenterHoursRange(week);
    const byDay = deriveClosedSegmentsByDay(week, null, range);
    expect(isFullyClosed(byDay.get(0) ?? [], range)).toBe(true);
    expect(byDay.get(1)).toEqual([]);
  });

  it('hatches only the mid-day gap for an override day with two windows', () => {
    const override = overrideWith({
      1: [
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ],
    });
    const range = deriveOverrideAwareRange([], override);
    const byDay = deriveClosedSegmentsByDay([], override, range);
    expect(byDay.get(1)).toEqual([{ start: 720, end: 840 }]); // 12:00–14:00
  });

  it('fully closes an override day with no windows', () => {
    const override = overrideWith({ 1: [{ open: '09:00', close: '18:00' }] });
    const range = deriveOverrideAwareRange([], override);
    const byDay = deriveClosedSegmentsByDay([], override, range);
    expect(isFullyClosed(byDay.get(0) ?? [], range)).toBe(true); // Sunday empty → closed
  });
});

import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  getGridBounds,
  deriveCenterHoursRange,
  deriveClosedDays,
  blockPosition,
  type GridBounds,
  type TimeRange,
} from '../../../src/renderer/lib/planning/time-range';
import type { CenterHoursWeek } from '../../../src/renderer/lib/center-hours';
import { hoursRow, session } from './_fixtures';

/** The hour labels `deriveCenterHoursRange` fills between two whole hours. */
function hoursBetween(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  return hours;
}

/** A fully open week so range tests focus on the hours they care about. */
const OPEN_WEEK: CenterHoursWeek = [
  hoursRow(0, '10:00', '18:00'),
  hoursRow(1, '19:00', '22:00'),
];

describe('timeToMinutes', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('getGridBounds', () => {
  it.each<[string, CenterHoursWeek, GridBounds]>([
    [
      'unions across open days: earliest open to latest close',
      OPEN_WEEK,
      { start: 600, end: 1320 }, // 10:00–22:00
    ],
    [
      'excludes closed days from both min and max',
      [
        hoursRow(0, '07:00', '18:00'),
        hoursRow(1, null, '23:00'), // closed (open null) — must not pull end later
        hoursRow(2, '05:00', null), // closed (close null) — must not pull start earlier
        hoursRow(3, '09:00', '21:00'),
      ],
      { start: 420, end: 1260 }, // 07:00–21:00
    ],
    [
      'falls back to 08:00–20:00 when every day is closed',
      [hoursRow(0, null, null), hoursRow(1, null, null)],
      { start: 480, end: 1200 },
    ],
    [
      'falls back to 08:00–20:00 on an empty week',
      [],
      { start: 480, end: 1200 },
    ],
  ])('%s', (_label, week, expected) => {
    expect(getGridBounds(week)).toEqual(expected);
  });
});

describe('deriveCenterHoursRange', () => {
  it.each<[string, CenterHoursWeek, number, number]>([
    [
      'spans the union of open days',
      OPEN_WEEK,
      10,
      22,
    ],
    [
      'floors the earliest opening time to a whole hour',
      [hoursRow(0, '10:30', '18:00')],
      10,
      18,
    ],
    [
      'ceils the latest closing time to a whole hour',
      [hoursRow(0, '09:00', '21:45')],
      9,
      22,
    ],
    [
      'falls back to 08:00–20:00 when no day is open',
      [hoursRow(0, null, null)],
      8,
      20,
    ],
    [
      'falls back to 08:00–20:00 on an empty week',
      [],
      8,
      20,
    ],
  ])('%s', (_label, week, startHour, endHour) => {
    const range = deriveCenterHoursRange(week);
    expect(range.startHour).toBe(startHour);
    expect(range.endHour).toBe(endHour);
    expect(range.hours).toEqual(hoursBetween(startHour, endHour));
  });

  it('fills every hour label between the floored and ceiled bounds, inclusive', () => {
    const range: TimeRange = deriveCenterHoursRange(OPEN_WEEK);
    expect(range.hours).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });
});

describe('deriveClosedDays', () => {
  it('returns the day indexes whose rows are closed', () => {
    const closed = deriveClosedDays([
      hoursRow(0, '09:00', '18:00'),
      hoursRow(1, null, null),
      hoursRow(2, '09:00', null),
      hoursRow(3, null, '18:00'),
    ]);
    expect([...closed].sort()).toEqual([1, 2, 3]);
  });

  it('returns an empty set for an empty week', () => {
    expect([...deriveClosedDays([])]).toEqual([]);
  });
});

describe('blockPosition', () => {
  it('places a block as a percentage of the visible range height', () => {
    const range = deriveCenterHoursRange([]); // 08:00–20:00, 720 min tall
    const pos = blockPosition(session({ start: '09:00', end: '10:00' }), range);
    // (540-480)/720 = 8.33% top, one hour = 8.33% height
    expect(pos.topPercent).toBeCloseTo(8.333, 2);
    expect(pos.heightPercent).toBeCloseTo(8.333, 2);
  });

  it('positions the first visible hour at the top edge', () => {
    const range = deriveCenterHoursRange([]);
    const pos = blockPosition(session({ start: '08:00', end: '09:00' }), range);
    expect(pos.topPercent).toBeCloseTo(0, 5);
  });
});

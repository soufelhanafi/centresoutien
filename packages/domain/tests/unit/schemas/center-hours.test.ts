import { describe, it, expect } from 'vitest';
import {
  weekdayHoursSchema,
  weeklyHoursSchema,
  DEFAULT_WEEKLY_HOURS,
  DEFAULT_WINDOW,
} from '../../../src/schemas/center-hours';

function issueCodes(result: { success: false; error: { issues: { message: string }[] } }): string[] {
  return result.error.issues.map((issue) => issue.message);
}

const openDay = (dayOfWeek = 1) => ({ dayOfWeek, windows: [{ open: '09:00', close: '18:00' }] });
const closedDay = (dayOfWeek = 0) => ({ dayOfWeek, windows: [] });

describe('weekdayHoursSchema', () => {
  it('accepts an open day with a single window', () => {
    expect(weekdayHoursSchema.safeParse(openDay()).success).toBe(true);
  });

  it('accepts a split day (two ordered, non-overlapping windows)', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 1,
      windows: [
        { open: '09:00', close: '15:00' },
        { open: '21:00', close: '23:00' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a closed day (empty window list)', () => {
    expect(weekdayHoursSchema.safeParse(closedDay()).success).toBe(true);
  });

  it('rejects a window whose close is not after open, with the invalid-window code', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [{ open: '18:00', close: '09:00' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-window');
  });

  it('rejects a zero-length window (open == close) with the invalid-window code', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [{ open: '09:00', close: '09:00' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-window');
  });

  it('rejects overlapping windows with the overlapping-windows code', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [
        { open: '09:00', close: '15:00' },
        { open: '14:00', close: '18:00' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('overlapping-windows');
  });

  it('rejects out-of-order windows with the windows-not-sorted code', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [
        { open: '14:00', close: '18:00' },
        { open: '09:00', close: '12:00' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('windows-not-sorted');
  });

  it('accepts back-to-back windows (touching boundaries are not an overlap)', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [
        { open: '09:00', close: '12:00' },
        { open: '12:00', close: '18:00' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed time', () => {
    const result = weekdayHoursSchema.safeParse({
      dayOfWeek: 3,
      windows: [{ open: '9:00', close: '18:00' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-time');
  });

  it('rejects an out-of-range weekday', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 7, windows: [{ open: '09:00', close: '18:00' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-weekday');
  });
});

describe('weeklyHoursSchema', () => {
  const fullWeek = () => [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => openDay(dayOfWeek));

  it('accepts exactly seven distinct weekdays', () => {
    expect(weeklyHoursSchema.safeParse(fullWeek()).success).toBe(true);
  });

  it('rejects fewer than seven rows', () => {
    const result = weeklyHoursSchema.safeParse(fullWeek().slice(0, 6));
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('incomplete-week');
  });

  it('rejects seven rows with a duplicated weekday', () => {
    const week = fullWeek();
    week[6] = openDay(0); // duplicate Sunday
    const result = weeklyHoursSchema.safeParse(week);
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('incomplete-week');
  });
});

describe('DEFAULT_WEEKLY_HOURS', () => {
  it('is a valid, open, seven-day week with the default window', () => {
    expect(DEFAULT_WEEKLY_HOURS).toHaveLength(7);
    expect(weeklyHoursSchema.safeParse(DEFAULT_WEEKLY_HOURS).success).toBe(true);
    for (const day of DEFAULT_WEEKLY_HOURS) {
      expect(day.windows).toEqual([DEFAULT_WINDOW]);
    }
  });
});

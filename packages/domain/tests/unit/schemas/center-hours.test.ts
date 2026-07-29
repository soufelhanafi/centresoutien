import { describe, it, expect } from 'vitest';
import {
  weekdayHoursSchema,
  weeklyHoursSchema,
  DEFAULT_WEEKLY_HOURS,
} from '../../../src/schemas/center-hours';

function issueCodes(result: { success: false; error: { issues: { message: string }[] } }): string[] {
  return result.error.issues.map((issue) => issue.message);
}

describe('weekdayHoursSchema', () => {
  it('accepts an open day with a valid range', () => {
    expect(weekdayHoursSchema.safeParse({ dayOfWeek: 1, open: '09:00', close: '18:00' }).success).toBe(
      true,
    );
  });

  it('accepts a closed day (both null)', () => {
    expect(weekdayHoursSchema.safeParse({ dayOfWeek: 0, open: null, close: null }).success).toBe(true);
  });

  it('rejects a half-set day with the closed-partial code', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 2, open: '09:00', close: null });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('closed-partial');
  });

  it('rejects an overnight range (close before open)', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 3, open: '18:00', close: '09:00' });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('close-before-open');
  });

  it('rejects equal open and close (zero-length day)', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 3, open: '09:00', close: '09:00' });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('close-before-open');
  });

  it('rejects a malformed time', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 3, open: '9:00', close: '18:00' });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-time');
  });

  it('rejects an out-of-range weekday', () => {
    const result = weekdayHoursSchema.safeParse({ dayOfWeek: 7, open: '09:00', close: '18:00' });
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('invalid-weekday');
  });
});

describe('weeklyHoursSchema', () => {
  const fullWeek = () =>
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, open: '09:00', close: '18:00' }));

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
    week[6] = { dayOfWeek: 0, open: '09:00', close: '18:00' }; // duplicate Sunday
    const result = weeklyHoursSchema.safeParse(week);
    expect(result.success).toBe(false);
    if (!result.success) expect(issueCodes(result)).toContain('incomplete-week');
  });
});

describe('DEFAULT_WEEKLY_HOURS', () => {
  it('is a valid, open, seven-day week', () => {
    expect(DEFAULT_WEEKLY_HOURS).toHaveLength(7);
    expect(weeklyHoursSchema.safeParse(DEFAULT_WEEKLY_HOURS).success).toBe(true);
  });
});

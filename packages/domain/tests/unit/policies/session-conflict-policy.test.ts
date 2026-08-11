import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import { SessionOutsideCenterHoursError } from '../../../src/errors/scheduling-errors';
import type { SessionTimeCandidate } from '../../../src/policies/session-conflict-policy';
import type { CenterHours } from '../../../src/entities/center-hours';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

type DayHours = Pick<CenterHours, 'dayOfWeek' | 'windows'>;

const w = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});

function day(dayOfWeek: WeekdayIndex, windows: readonly TimeWindow[]): DayHours {
  return { dayOfWeek, windows };
}

function candidate(dayOfWeek: WeekdayIndex, start: string, end: string): SessionTimeCandidate {
  return { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

// A week open Mon–Sat 09:00–18:00, Sunday closed.
const week: DayHours[] = [
  day(0, []),
  day(1, [w('09:00', '18:00')]),
  day(2, [w('09:00', '18:00')]),
  day(3, [w('09:00', '18:00')]),
  day(4, [w('09:00', '18:00')]),
  day(5, [w('09:00', '18:00')]),
  day(6, [w('09:00', '18:00')]),
];

describe('SessionConflictPolicy.withinCenterHours', () => {
  describe('accepted (returns null)', () => {
    it('sits inside opening hours', () => {
      expect(SessionConflictPolicy.withinCenterHours(candidate(1, '10:00', '11:00'), week)).toBeNull();
    });

    it('touches both boundaries exactly (inclusive)', () => {
      expect(SessionConflictPolicy.withinCenterHours(candidate(1, '09:00', '18:00'), week)).toBeNull();
    });
  });

  describe('rejected (returns the error)', () => {
    it('flags a closed day as closed', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(0, '10:00', '11:00'), week);
      expect(error).toBeInstanceOf(SessionOutsideCenterHoursError);
      expect(error?.reason).toBe('closed');
    });

    it('flags a weekday absent from the week as closed', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(3, '10:00', '11:00'), [
        day(1, [w('09:00', '18:00')]),
      ]);
      expect(error?.reason).toBe('closed');
      expect(error?.open).toBeNull();
    });

    it('flags a start before open', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(1, '08:30', '10:00'), week);
      expect(error?.reason).toBe('before-open');
      expect(error?.open).toBe('09:00');
    });

    it('flags an end after close', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(1, '17:00', '18:30'), week);
      expect(error?.reason).toBe('after-close');
      expect(error?.close).toBe('18:00');
    });
  });

  // SOU-197: a weekday can carry two windows split by the mid-day break.
  describe('split day (mid-day break)', () => {
    const splitWeek: DayHours[] = [day(1, [w('09:00', '12:00'), w('14:00', '18:00')])];

    it('accepts a session inside the first window', () => {
      expect(SessionConflictPolicy.withinCenterHours(candidate(1, '10:00', '11:00'), splitWeek)).toBeNull();
    });

    it('accepts a session inside the second window', () => {
      expect(SessionConflictPolicy.withinCenterHours(candidate(1, '15:00', '16:00'), splitWeek)).toBeNull();
    });

    it('accepts a session touching the second window boundaries (inclusive)', () => {
      expect(SessionConflictPolicy.withinCenterHours(candidate(1, '14:00', '18:00'), splitWeek)).toBeNull();
    });

    it('rejects a session spanning the mid-day break as outside-windows', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(1, '11:30', '14:30'), splitWeek);
      expect(error?.reason).toBe('outside-windows');
      // The day's first open and last close are reported so the renderer can show when it's open.
      expect(error?.open).toBe('09:00');
      expect(error?.close).toBe('18:00');
    });

    it('rejects a session entirely inside the break as outside-windows', () => {
      const error = SessionConflictPolicy.withinCenterHours(candidate(1, '12:30', '13:00'), splitWeek);
      expect(error?.reason).toBe('outside-windows');
    });
  });
});

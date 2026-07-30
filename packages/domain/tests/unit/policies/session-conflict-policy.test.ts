import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import { SessionOutsideCenterHoursError } from '../../../src/errors/scheduling-errors';
import type { SessionTimeCandidate } from '../../../src/policies/session-conflict-policy';
import type { CenterHours } from '../../../src/entities/center-hours';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

type DayHours = Pick<CenterHours, 'dayOfWeek' | 'open' | 'close'>;

function day(dayOfWeek: WeekdayIndex, open: string | null, close: string | null): DayHours {
  return { dayOfWeek, open: open as TimeOfDay | null, close: close as TimeOfDay | null };
}

function candidate(dayOfWeek: WeekdayIndex, start: string, end: string): SessionTimeCandidate {
  return { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

// A week open Mon–Sat 09:00–18:00, Sunday closed.
const week: DayHours[] = [
  day(0, null, null),
  day(1, '09:00', '18:00'),
  day(2, '09:00', '18:00'),
  day(3, '09:00', '18:00'),
  day(4, '09:00', '18:00'),
  day(5, '09:00', '18:00'),
  day(6, '09:00', '18:00'),
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
        day(1, '09:00', '18:00'),
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
});

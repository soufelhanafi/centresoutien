import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import { SessionOutsideCenterHoursError } from '../../../src/errors/scheduling-errors';
import type { SessionTimeCandidate } from '../../../src/policies/session-conflict-policy';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const w = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});
const candidate = (start: string, end: string): SessionTimeCandidate => ({
  dayOfWeek: 1 as WeekdayIndex,
  start: start as TimeOfDay,
  end: end as TimeOfDay,
});

// A Ramadan day: open 09:00–15:00, iftar break, reopen 21:00–23:00.
const ramadanDay = [w('09:00', '15:00'), w('21:00', '23:00')];

describe('SessionConflictPolicy.withinWindows', () => {
  describe('accepted (returns null)', () => {
    it('fits inside the first window', () => {
      expect(SessionConflictPolicy.withinWindows(candidate('10:00', '12:00'), ramadanDay)).toBeNull();
    });

    it('fits inside the second window', () => {
      expect(SessionConflictPolicy.withinWindows(candidate('21:30', '22:30'), ramadanDay)).toBeNull();
    });

    it('touches a window boundary exactly (inclusive)', () => {
      expect(SessionConflictPolicy.withinWindows(candidate('09:00', '15:00'), ramadanDay)).toBeNull();
    });
  });

  describe('rejected (returns the error)', () => {
    it('flags a closed day (no windows) as closed', () => {
      const error = SessionConflictPolicy.withinWindows(candidate('10:00', '11:00'), []);
      expect(error).toBeInstanceOf(SessionOutsideCenterHoursError);
      expect(error?.reason).toBe('closed');
      expect(error?.open).toBeNull();
    });

    it('flags a start before the first window opens', () => {
      const error = SessionConflictPolicy.withinWindows(candidate('08:30', '10:00'), ramadanDay);
      expect(error?.reason).toBe('before-open');
      expect(error?.open).toBe('09:00');
      expect(error?.close).toBe('23:00');
    });

    it('flags an end after the last window closes', () => {
      const error = SessionConflictPolicy.withinWindows(candidate('22:00', '23:30'), ramadanDay);
      expect(error?.reason).toBe('after-close');
      expect(error?.close).toBe('23:00');
    });

    it('flags a session landing in the iftar gap as outside-windows', () => {
      const error = SessionConflictPolicy.withinWindows(candidate('16:00', '17:00'), ramadanDay);
      expect(error?.reason).toBe('outside-windows');
    });

    it('flags a session straddling the first window boundary into the gap', () => {
      const error = SessionConflictPolicy.withinWindows(candidate('14:00', '16:00'), ramadanDay);
      expect(error?.reason).toBe('outside-windows');
    });
  });
});

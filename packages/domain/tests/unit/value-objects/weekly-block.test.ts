import { describe, it, expect } from 'vitest';
import { weeklyBlockFromOpen, weeklyBlockInFittingWindow } from '../../../src/value-objects/weekly-block';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const WED = 3 as WeekdayIndex;

function window(open: string, close: string): TimeWindow {
  return { open: open as TimeOfDay, close: close as TimeOfDay };
}

describe('weeklyBlockFromOpen', () => {
  it('anchors the block at the open time and runs for the duration', () => {
    expect(weeklyBlockFromOpen(WED, '14:00' as TimeOfDay, 90)).toEqual({
      dayOfWeek: WED,
      start: '14:00',
      end: '15:30',
    });
  });
});

describe('weeklyBlockInFittingWindow (SOU-218)', () => {
  it('places the session in the single window when it fits', () => {
    expect(weeklyBlockInFittingWindow(WED, [window('09:00', '18:00')], 90)).toEqual({
      dayOfWeek: WED,
      start: '09:00',
      end: '10:30',
    });
  });

  it('prefers the earliest window that fits on a split day', () => {
    const split = [window('09:00', '12:00'), window('14:00', '18:00')];
    expect(weeklyBlockInFittingWindow(WED, split, 90)?.start).toBe('09:00');
  });

  it('skips a too-short first window and places the session in the afternoon window', () => {
    const split = [window('09:00', '10:00'), window('14:00', '18:00')];
    expect(weeklyBlockInFittingWindow(WED, split, 90)).toEqual({
      dayOfWeek: WED,
      start: '14:00',
      end: '15:30',
    });
  });

  it('accepts a window whose span equals the duration exactly', () => {
    expect(weeklyBlockInFittingWindow(WED, [window('14:00', '15:30')], 90)?.start).toBe('14:00');
  });

  it('falls back to the first window when no window is long enough, leaving the overrun to conflict detection', () => {
    const split = [window('09:00', '10:00'), window('14:00', '15:00')];
    expect(weeklyBlockInFittingWindow(WED, split, 90)).toEqual({
      dayOfWeek: WED,
      start: '09:00',
      end: '10:30',
    });
  });

  it('returns null for a closed day (no windows)', () => {
    expect(weeklyBlockInFittingWindow(WED, [], 90)).toBeNull();
  });
});

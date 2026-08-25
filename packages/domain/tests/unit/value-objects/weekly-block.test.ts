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

describe('weeklyBlockInFittingWindow — occupied-aware packing (bug 1 repro)', () => {
  it('packs a second block right after an occupied one instead of colliding with it', () => {
    // 19:00–22:00 window, 90-minute sessions, the first slot already taken:
    // the earliest free slot is 20:30, not the window's own 19:00 open.
    const occupied = [window('19:00', '20:30')];
    expect(weeklyBlockInFittingWindow(WED, [window('19:00', '22:00')], 90, occupied)).toEqual({
      dayOfWeek: WED,
      start: '20:30',
      end: '22:00',
    });
  });

  it('with no occupied slots, still anchors at the window open (unchanged default)', () => {
    expect(weeklyBlockInFittingWindow(WED, [window('19:00', '22:00')], 90)).toEqual({
      dayOfWeek: WED,
      start: '19:00',
      end: '20:30',
    });
  });

  it('skips over an occupied slot in the middle of a window to reach a later free gap', () => {
    const occupied = [window('10:00', '11:30')];
    expect(weeklyBlockInFittingWindow(WED, [window('09:00', '13:00')], 90, occupied)).toEqual({
      dayOfWeek: WED,
      start: '11:30',
      end: '13:00',
    });
  });

  it('falls back to the old anchor-collision behavior when nothing free fits (genuinely infeasible)', () => {
    // A 3-hour window can only ever hold two 90-minute sessions; a third has
    // nowhere free to go, so it falls back to the window's own open — the
    // resulting double-book is left for the conflict pass to flag, not thrown.
    const occupied = [window('19:00', '20:30'), window('20:30', '22:00')];
    expect(weeklyBlockInFittingWindow(WED, [window('19:00', '22:00')], 90, occupied)).toEqual({
      dayOfWeek: WED,
      start: '19:00',
      end: '20:30',
    });
  });

  it('finds the free slot in a later window when an earlier window is fully occupied', () => {
    const windows = [window('09:00', '10:30'), window('14:00', '18:00')];
    const occupied = [window('09:00', '10:30')];
    expect(weeklyBlockInFittingWindow(WED, windows, 90, occupied)).toEqual({
      dayOfWeek: WED,
      start: '14:00',
      end: '15:30',
    });
  });
});

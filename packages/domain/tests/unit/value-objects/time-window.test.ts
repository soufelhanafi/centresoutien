import { describe, it, expect } from 'vitest';
import {
  isValidTimeWindow,
  timeWindowContains,
  timeWindowsContain,
  areOrderedNonOverlappingWindows,
  intersectTimeWindows,
} from '../../../src/value-objects/time-window';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

function window(open: string, close: string): TimeWindow {
  return { open: open as TimeOfDay, close: close as TimeOfDay };
}
const t = (value: string): TimeOfDay => value as TimeOfDay;

describe('isValidTimeWindow', () => {
  it('accepts a window whose close is strictly after open', () => {
    expect(isValidTimeWindow(window('09:00', '15:00'))).toBe(true);
  });

  it('rejects a zero-length window', () => {
    expect(isValidTimeWindow(window('09:00', '09:00'))).toBe(false);
  });

  it('rejects a backwards (overnight) window', () => {
    expect(isValidTimeWindow(window('21:00', '09:00'))).toBe(false);
  });
});

describe('timeWindowContains', () => {
  const w = window('09:00', '15:00');

  it('accepts a range fully inside', () => {
    expect(timeWindowContains(w, t('10:00'), t('11:00'))).toBe(true);
  });

  it('accepts a range touching both boundaries (inclusive)', () => {
    expect(timeWindowContains(w, t('09:00'), t('15:00'))).toBe(true);
  });

  it('rejects a range starting before open', () => {
    expect(timeWindowContains(w, t('08:30'), t('10:00'))).toBe(false);
  });

  it('rejects a range ending after close', () => {
    expect(timeWindowContains(w, t('14:00'), t('15:30'))).toBe(false);
  });
});

describe('timeWindowsContain (multi-window / iftar break)', () => {
  const ramadanDay = [window('09:00', '15:00'), window('21:00', '23:00')];

  it('accepts a range inside the first window', () => {
    expect(timeWindowsContain(ramadanDay, t('10:00'), t('12:00'))).toBe(true);
  });

  it('accepts a range inside the second window', () => {
    expect(timeWindowsContain(ramadanDay, t('21:30'), t('22:30'))).toBe(true);
  });

  it('rejects a range that lands in the gap between windows', () => {
    expect(timeWindowsContain(ramadanDay, t('16:00'), t('17:00'))).toBe(false);
  });

  it('rejects a range that straddles a window boundary into the gap', () => {
    expect(timeWindowsContain(ramadanDay, t('14:00'), t('16:00'))).toBe(false);
  });

  it('rejects everything when the day is closed (no windows)', () => {
    expect(timeWindowsContain([], t('10:00'), t('11:00'))).toBe(false);
  });
});

describe('areOrderedNonOverlappingWindows', () => {
  it('accepts an empty list (a closed day)', () => {
    expect(areOrderedNonOverlappingWindows([])).toBe(true);
  });

  it('accepts a single valid window', () => {
    expect(areOrderedNonOverlappingWindows([window('09:00', '18:00')])).toBe(true);
  });

  it('accepts ordered, non-overlapping windows (iftar break)', () => {
    expect(
      areOrderedNonOverlappingWindows([window('09:00', '15:00'), window('21:00', '23:00')]),
    ).toBe(true);
  });

  it('accepts back-to-back touching windows', () => {
    expect(
      areOrderedNonOverlappingWindows([window('09:00', '12:00'), window('12:00', '15:00')]),
    ).toBe(true);
  });

  it('rejects windows out of order', () => {
    expect(
      areOrderedNonOverlappingWindows([window('21:00', '23:00'), window('09:00', '15:00')]),
    ).toBe(false);
  });

  it('rejects overlapping windows (a shared minute)', () => {
    expect(
      areOrderedNonOverlappingWindows([window('09:00', '15:00'), window('14:00', '18:00')]),
    ).toBe(false);
  });

  it('rejects when any window is itself malformed', () => {
    expect(
      areOrderedNonOverlappingWindows([window('09:00', '15:00'), window('22:00', '21:00')]),
    ).toBe(false);
  });
});

describe('intersectTimeWindows', () => {
  it('narrows a wide window down to a narrower one nested inside it', () => {
    expect(intersectTimeWindows([window('09:00', '22:00')], [window('19:00', '22:00')])).toEqual([
      window('19:00', '22:00'),
    ]);
  });

  it('returns the overlap of two partially-overlapping windows', () => {
    expect(intersectTimeWindows([window('09:00', '12:00')], [window('11:00', '15:00')])).toEqual([
      window('11:00', '12:00'),
    ]);
  });

  it('returns nothing for two disjoint windows', () => {
    expect(intersectTimeWindows([window('09:00', '12:00')], [window('14:00', '18:00')])).toEqual([]);
  });

  it('returns nothing for windows that only touch, not overlap', () => {
    expect(intersectTimeWindows([window('09:00', '12:00')], [window('12:00', '15:00')])).toEqual([]);
  });

  it('returns nothing when either side is empty (a closed day on either end)', () => {
    expect(intersectTimeWindows([], [window('19:00', '22:00')])).toEqual([]);
    expect(intersectTimeWindows([window('19:00', '22:00')], [])).toEqual([]);
  });

  it('intersects a split day (iftar break) against a single wide window per-segment', () => {
    expect(
      intersectTimeWindows(
        [window('09:00', '15:00'), window('21:00', '23:00')],
        [window('14:00', '22:00')],
      ),
    ).toEqual([window('14:00', '15:00'), window('21:00', '22:00')]);
  });
});

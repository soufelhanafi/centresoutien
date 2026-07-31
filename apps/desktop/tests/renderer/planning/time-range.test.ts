import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  deriveTimeRange,
  blockPosition,
} from '../../../src/renderer/lib/planning/time-range';
import { session } from './_fixtures';

describe('timeToMinutes', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('deriveTimeRange', () => {
  it('falls back to the default 08:00–20:00 window when the week is empty', () => {
    const range = deriveTimeRange([]);
    expect(range.startHour).toBe(8);
    expect(range.endHour).toBe(20);
    expect(range.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('extends the window to fit an early start and a late end, never clipping', () => {
    const range = deriveTimeRange([
      session({ start: '07:15', end: '08:15' }),
      session({ start: '20:30', end: '21:15' }),
    ]);
    expect(range.startHour).toBe(7); // floor(07:15)
    expect(range.endHour).toBe(22); // ceil(21:15)
    expect(range.hours[0]).toBe(7);
    expect(range.hours.at(-1)).toBe(22);
  });

  it('keeps the default window when sessions fit inside it', () => {
    const range = deriveTimeRange([session({ start: '10:00', end: '11:00' })]);
    expect(range.startHour).toBe(8);
    expect(range.endHour).toBe(20);
  });
});

describe('blockPosition', () => {
  it('places a block as a percentage of the visible range height', () => {
    const range = deriveTimeRange([]); // 08:00–20:00, 720 min tall
    const pos = blockPosition(session({ start: '09:00', end: '10:00' }), range);
    // (540-480)/720 = 8.33% top, one hour = 8.33% height
    expect(pos.topPercent).toBeCloseTo(8.333, 2);
    expect(pos.heightPercent).toBeCloseTo(8.333, 2);
  });

  it('positions the first visible hour at the top edge', () => {
    const range = deriveTimeRange([]);
    const pos = blockPosition(session({ start: '08:00', end: '09:00' }), range);
    expect(pos.topPercent).toBeCloseTo(0, 5);
  });
});

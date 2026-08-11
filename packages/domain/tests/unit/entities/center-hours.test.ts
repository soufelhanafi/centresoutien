import { describe, it, expect } from 'vitest';
import { isClosed } from '../../../src/entities/center-hours';
import type { TimeWindow } from '../../../src/value-objects/time-window';

const w = (open: string, close: string): TimeWindow => ({ open, close } as TimeWindow);

describe('isClosed', () => {
  it('is closed when the day has no windows', () => {
    expect(isClosed({ windows: [] })).toBe(true);
  });

  it('is open when the day has at least one window', () => {
    expect(isClosed({ windows: [w('09:00', '18:00')] })).toBe(false);
  });

  it('is open for a split-day (two windows)', () => {
    expect(isClosed({ windows: [w('09:00', '15:00'), w('21:00', '23:00')] })).toBe(false);
  });
});

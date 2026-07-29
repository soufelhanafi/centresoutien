import { describe, it, expect } from 'vitest';
import { isClosed } from '../../../src/entities/center-hours';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

describe('isClosed', () => {
  it('is closed when both open and close are null', () => {
    expect(isClosed({ open: null, close: null })).toBe(true);
  });

  it('is open when both times are set', () => {
    expect(isClosed({ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay })).toBe(false);
  });

  it('treats a half-set row (a state the DB CHECK forbids) as closed', () => {
    expect(isClosed({ open: '09:00' as TimeOfDay, close: null })).toBe(true);
    expect(isClosed({ open: null, close: '18:00' as TimeOfDay })).toBe(true);
  });
});

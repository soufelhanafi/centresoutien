import { describe, it, expect } from 'vitest';
import { resolveGeneratorMaterializationRange } from '../../../src/services/session-generator';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const MONDAY = 1 as WeekdayIndex;
const THURSDAY = 4 as WeekdayIndex;

describe('resolveGeneratorMaterializationRange', () => {
  it('passes an explicit { startDate, endDate } range straight through, regardless of weekday', () => {
    const range = { startDate: '2026-01-01', endDate: '2026-06-30' };
    expect(resolveGeneratorMaterializationRange(range, MONDAY)).toEqual({
      start: '2026-01-01',
      end: '2026-06-30',
    });
    expect(resolveGeneratorMaterializationRange(range, THURSDAY)).toEqual({
      start: '2026-01-01',
      end: '2026-06-30',
    });
  });

  it('converts an { startDate, occurrenceCount } range to the weekday-specific end date', () => {
    // 2026-01-01 is a Thursday; the 5th Thursday from it is 2026-01-29.
    expect(resolveGeneratorMaterializationRange({ startDate: '2026-01-01', occurrenceCount: 5 }, THURSDAY)).toEqual({
      start: '2026-01-01',
      end: '2026-01-29',
    });
  });

  it('computes a different end date per weekday for the same occurrence count and start date', () => {
    const range = { startDate: '2026-01-01', occurrenceCount: 3 };
    // Thursday: 01, 08, 15 -> 3rd is 2026-01-15. Monday: 05, 12, 19 -> 3rd is 2026-01-19.
    expect(resolveGeneratorMaterializationRange(range, THURSDAY).end).toBe('2026-01-15');
    expect(resolveGeneratorMaterializationRange(range, MONDAY).end).toBe('2026-01-19');
  });
});

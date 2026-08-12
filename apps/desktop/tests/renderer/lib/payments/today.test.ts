import { describe, expect, it } from 'vitest';
import { todayIso } from '../../../../src/renderer/lib/payments/today';

describe('todayIso', () => {
  it('formats the local calendar day instead of slicing the UTC ISO timestamp', () => {
    class BoundaryDate extends Date {
      override getFullYear(): number {
        return 2026;
      }

      override getMonth(): number {
        return 7;
      }

      override getDate(): number {
        return 10;
      }

      override toISOString(): string {
        return '2026-08-09T23:30:00.000Z';
      }
    }

    const localBoundary = new BoundaryDate('2026-08-09T23:30:00.000Z');

    expect(localBoundary.toISOString().slice(0, 10)).toBe('2026-08-09');
    expect(todayIso(localBoundary)).toBe('2026-08-10');
  });
});

import { describe, it, expect } from 'vitest';
import {
  circularWeekdayGaps,
  satisfiesMinGap,
  gapViolations,
} from '../../../src/policies/weekday-gap';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

// Weekday indices: 0 = Sunday … 6 = Saturday, matching Date.getUTCDay().
const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;
const WED = 3 as WeekdayIndex;
const THU = 4 as WeekdayIndex;
const FRI = 5 as WeekdayIndex;

describe('circularWeekdayGaps', () => {
  it('returns no gaps for a single-session week', () => {
    expect(circularWeekdayGaps([MON])).toEqual([]);
  });

  it('returns no gaps for an empty pattern', () => {
    expect(circularWeekdayGaps([])).toEqual([]);
  });

  it('measures the wrap gap circularly, not linearly', () => {
    // Mon(1) → Thu(4) is 3; the wrap Thu(4) → Mon(1) is 4 (3 days + the week wrap), summing to 7.
    expect(circularWeekdayGaps([MON, THU])).toEqual([
      { fromDay: MON, toDay: THU, gapDays: 3 },
      { fromDay: THU, toDay: MON, gapDays: 4 },
    ]);
  });

  it('collapses duplicate weekdays before measuring', () => {
    expect(circularWeekdayGaps([MON, MON, THU])).toEqual([
      { fromDay: MON, toDay: THU, gapDays: 3 },
      { fromDay: THU, toDay: MON, gapDays: 4 },
    ]);
  });

  it('sums all consecutive gaps to a full week', () => {
    const total = circularWeekdayGaps([MON, WED, FRI]).reduce((sum, g) => sum + g.gapDays, 0);
    expect(total).toBe(7);
  });
});

describe('satisfiesMinGap', () => {
  const cases = [
    { name: 'single session always satisfies', days: [MON], gap: 3, ok: true },
    { name: 'Mon+Tue violates a 2-day gap', days: [MON, TUE], gap: 2, ok: false },
    { name: 'Mon+Fri honors a 2-day gap', days: [MON, FRI], gap: 2, ok: true },
    { name: 'Mon+Wed+Fri honors a 2-day gap', days: [MON, WED, FRI], gap: 2, ok: true },
    { name: 'Mon+Wed+Fri violates a 3-day gap (needs 9 days spread)', days: [MON, WED, FRI], gap: 3, ok: false },
    { name: 'a 1-day gap accepts back-to-back days', days: [MON, TUE], gap: 1, ok: true },
  ] as const;

  it.each(cases)('$name', ({ days, gap, ok }) => {
    expect(satisfiesMinGap(days, gap)).toBe(ok);
  });
});

describe('gapViolations', () => {
  it('is empty when the pattern honors the gap', () => {
    expect(gapViolations([MON, WED, FRI], 2)).toEqual([]);
  });

  it('reports each consecutive pair that falls short', () => {
    // Mon(1)→Tue(2) gap 1 (<2), Tue(2)→Wed(3) gap 1 (<2), wrap Wed(3)→Mon(1) gap 5 (ok).
    expect(gapViolations([MON, TUE, WED], 2)).toEqual([
      { fromDay: MON, toDay: TUE, gapDays: 1 },
      { fromDay: TUE, toDay: WED, gapDays: 1 },
    ]);
  });

  it('flags a too-tight wrap gap', () => {
    // Mon(1)→Fri(5) gap 4 (ok), wrap Fri(5)→Mon(1) gap 3 (<4).
    expect(gapViolations([MON, FRI], 4)).toEqual([{ fromDay: FRI, toDay: MON, gapDays: 3 }]);
  });
});

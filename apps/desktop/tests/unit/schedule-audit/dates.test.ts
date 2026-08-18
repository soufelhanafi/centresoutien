import { describe, expect, it } from 'vitest';
import { isoLocalDate, nextMondayStrictlyAfter, dateLabel } from '../../e2e/schedule-audit.dates';

// Local calendar constructor so the asserted day matches the seeded day (no UTC
// off-by-one). Month is 1-based here for readability at the call site.
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

const weekday = (date: Date): number => date.getDay();

describe('isoLocalDate', () => {
  it('zero-pads a single-digit month and day', () => {
    expect(isoLocalDate(localDate(2026, 3, 5))).toBe('2026-03-05');
  });

  it('keeps a two-digit month and day intact', () => {
    expect(isoLocalDate(localDate(2026, 11, 24))).toBe('2026-11-24');
  });

  it('handles a month rollover boundary', () => {
    expect(isoLocalDate(localDate(2026, 1, 31))).toBe('2026-01-31');
  });

  it('handles a year rollover (Dec 31 into the same rendered year)', () => {
    expect(isoLocalDate(localDate(2026, 12, 31))).toBe('2026-12-31');
    // A Date advanced past Dec 31 rolls into the next year via local components.
    const dayAfter = localDate(2026, 12, 31);
    dayAfter.setDate(dayAfter.getDate() + 1);
    expect(isoLocalDate(dayAfter)).toBe('2027-01-01');
  });
});

describe('nextMondayStrictlyAfter', () => {
  const cases: ReadonlyArray<{ label: string; input: Date }> = [
    { label: 'Sunday', input: localDate(2026, 8, 23) },
    { label: 'Monday', input: localDate(2026, 8, 24) },
    { label: 'Tuesday', input: localDate(2026, 8, 25) },
    { label: 'Wednesday', input: localDate(2026, 8, 26) },
    { label: 'Thursday', input: localDate(2026, 8, 27) },
    { label: 'Friday', input: localDate(2026, 8, 28) },
    { label: 'Saturday', input: localDate(2026, 8, 29) },
  ];

  for (const { label, input } of cases) {
    it(`returns a Monday strictly after a ${label} input`, () => {
      const result = nextMondayStrictlyAfter(input);
      expect(weekday(result)).toBe(1);
      expect(result.getTime()).toBeGreaterThan(input.getTime());
    });
  }

  it('jumps a full week when the input is itself a Monday (never returns the same day)', () => {
    const monday = localDate(2026, 8, 24);
    expect(weekday(monday)).toBe(1);
    const result = nextMondayStrictlyAfter(monday);
    expect(isoLocalDate(result)).toBe('2026-08-31');
  });

  it('returns the very next day when the input is a Sunday', () => {
    const sunday = localDate(2026, 8, 23);
    expect(weekday(sunday)).toBe(0);
    expect(isoLocalDate(nextMondayStrictlyAfter(sunday))).toBe('2026-08-24');
  });
});

describe('dateLabel', () => {
  const arabicIndicDigits = /[٠١٢٣٤٥٦٧٨٩]/;

  it('renders the French label as day + long month + year', () => {
    expect(dateLabel(localDate(2026, 8, 17), 'fr')).toBe('17 août 2026');
  });

  it('renders the Arabic (ar-MA) month name غشت with Latin digits, never Arabic-Indic', () => {
    const label = dateLabel(localDate(2026, 8, 17), 'ar');
    expect(label).toContain('غشت');
    expect(label).toContain('17');
    expect(label).toContain('2026');
    expect(label).not.toMatch(arabicIndicDigits);
  });
});

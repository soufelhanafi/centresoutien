import { describe, it, expect } from 'vitest';
import { holidayInputSchema } from '../../../src/schemas/holiday';

function firstError(input: unknown): string | undefined {
  const result = holidayInputSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

const valid = {
  name: { fr: 'Aïd', ar: 'عيد' },
  kind: 'lunar' as const,
  startDate: '2026-05-27',
  endDate: '2026-05-29',
};

describe('holidayInputSchema', () => {
  it('accepts and trims a valid holiday', () => {
    const parsed = holidayInputSchema.parse({
      ...valid,
      name: { fr: '  Aïd  ', ar: '  عيد  ' },
      startDate: '  2026-05-27  ',
      endDate: '  2026-05-29  ',
    });
    expect(parsed.name).toEqual({ fr: 'Aïd', ar: 'عيد' });
    expect(parsed.startDate).toBe('2026-05-27');
    expect(parsed.endDate).toBe('2026-05-29');
  });

  it('accepts a single-day holiday (start == end)', () => {
    expect(holidayInputSchema.safeParse({ ...valid, startDate: '2026-05-27', endDate: '2026-05-27' }).success).toBe(true);
  });

  // SOU-271: AR is optional data entry — a holiday with an empty AR name is
  // valid and keeps '' (never null).
  it.each(['', '   '])('accepts an empty AR name (FR-only entry): %o', (ar) => {
    const parsed = holidayInputSchema.parse({ ...valid, name: { fr: 'Aïd', ar } });
    expect(parsed.name).toEqual({ fr: 'Aïd', ar: '' });
  });

  it('accepts a cross-year range (end later as a full date)', () => {
    expect(holidayInputSchema.safeParse({ ...valid, startDate: '2026-12-24', endDate: '2027-01-04' }).success).toBe(true);
  });

  it.each([
    [{ ...valid, name: { fr: '', ar: 'عيد' } }, 'required'],
    [{ ...valid, name: { fr: 'x'.repeat(81), ar: 'عيد' } }, 'too-long'],
    [{ ...valid, name: { fr: 'Aïd', ar: 'ع'.repeat(81) } }, 'too-long'],
    [{ ...valid, startDate: '2026-02-30' }, 'invalid-date'],
    [{ ...valid, startDate: '2026-13-01' }, 'invalid-date'],
    [{ ...valid, endDate: 'not-a-date' }, 'invalid-date'],
    [{ ...valid, kind: 'weekly' }, 'invalid-holiday-kind'],
    [{ ...valid, startDate: '2026-05-29', endDate: '2026-05-27' }, 'end-before-start'],
  ])('rejects %o with code %s', (input, code) => {
    expect(firstError(input)).toBe(code);
  });

  it('does not add end-before-start when a date is already malformed', () => {
    // startDate invalid → only invalid-date fires, not a spurious range error.
    expect(firstError({ ...valid, startDate: 'bad', endDate: '2020-01-01' })).toBe('invalid-date');
  });

  it('accepts Feb 29 in a leap year and rejects it in a common year', () => {
    expect(holidayInputSchema.safeParse({ ...valid, startDate: '2028-02-29', endDate: '2028-02-29' }).success).toBe(true);
    expect(holidayInputSchema.safeParse({ ...valid, startDate: '2027-02-29', endDate: '2027-02-29' }).success).toBe(false);
  });
});

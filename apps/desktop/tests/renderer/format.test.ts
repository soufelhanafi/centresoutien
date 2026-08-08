import { describe, expect, it } from 'vitest';
import {
  formatHoursMinutes,
  formatMadParts,
  formatMonthName,
  formatSignedMad,
  formatSignedPercent,
} from '../../src/renderer/lib/format';

describe('formatMonthName', () => {
  it('formats a YYYY-MM month as its long name only', () => {
    expect(formatMonthName('2026-06', 'fr')).toBe('juin');
    expect(formatMonthName('2026-06', 'ar')).not.toBe('2026-06');
  });

  it('falls back to the raw string when unparseable', () => {
    expect(formatMonthName('nope', 'fr')).toBe('nope');
  });
});

describe('formatMadParts', () => {
  it('splits a MAD-centimes amount into figure and currency label', () => {
    const { amount, unit } = formatMadParts(4825000, 'fr');
    // The grouping separator (narrow no-break space in full-ICU Chromium, `.`
    // in Node's smaller ICU) varies by ICU data — assert the digits survive.
    expect(amount).toMatch(/48[^\d]+250/);
    expect(unit).toBe('MAD');
  });

  it('zero formats cleanly', () => {
    expect(formatMadParts(0, 'fr')).toEqual({ amount: '0', unit: 'MAD' });
  });
});

describe('formatSignedPercent', () => {
  it('formats signed percent points with one decimal', () => {
    expect(formatSignedPercent(6.2, 'fr')).toMatch(/^\+6,2/);
    expect(formatSignedPercent(-3.5, 'fr')).toMatch(/^-3,5/);
  });

  it('omits the sign for zero', () => {
    expect(formatSignedPercent(0, 'fr')).toMatch(/^0/);
    expect(formatSignedPercent(0, 'fr')).not.toMatch(/^[+-]/);
  });
});

describe('formatSignedMad', () => {
  it('formats a signed centimes diff as whole MAD with sign', () => {
    expect(formatSignedMad(115000, 'fr')).toMatch(/^\+1[^\d]+150/);
    expect(formatSignedMad(-45000, 'fr')).toBe('-450');
  });
});

describe('formatHoursMinutes', () => {
  it('formats minutes as hhmm', () => {
    expect(formatHoursMinutes(990)).toBe('16h30');
    expect(formatHoursMinutes(3210)).toBe('53h30');
  });

  it('pads minutes to two digits', () => {
    expect(formatHoursMinutes(60)).toBe('1h00');
    expect(formatHoursMinutes(5)).toBe('0h05');
  });
});

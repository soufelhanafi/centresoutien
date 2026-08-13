import { describe, it, expect } from 'vitest';
import { formatIsoDate } from '../../../src/renderer/lib/center-hours-overrides/dates';

describe('formatIsoDate', () => {
  it('returns the raw string when the ISO date is missing parts', () => {
    expect(formatIsoDate('2026', 'fr')).toBe('2026');
  });

  it('formats a valid date without shifting the day (UTC-anchored)', () => {
    expect(formatIsoDate('2026-03-01', 'fr')).not.toBe('2026-03-01');
  });

  it('renders Western digits for any Arabic-prefixed locale (routed through bcp47)', () => {
    const bare = formatIsoDate('2026-03-01', 'ar');
    const regionSuffixed = formatIsoDate('2026-03-01', 'ar-MA');
    expect(regionSuffixed).toBe(bare);
    expect(bare).toMatch(/2026/);
    expect(bare).not.toMatch(/[٠-٩]/);
  });
});

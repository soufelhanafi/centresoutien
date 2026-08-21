import { describe, expect, it } from 'vitest';
import { canonicalizeReason } from '../../../src/renderer/lib/schedule-audit/stranded-session-view';

describe('canonicalizeReason — SOU-296 legacy→canonical mapping', () => {
  it.each([
    ['outside-center-hours', 'outside-center-hours'],
    ['on-holiday', 'holiday/blackout'],
    ['outside-teacher-availability', 'teacher-unavailable'],
  ] as const)('maps the legacy wire code %s', (legacy, canonical) => {
    expect(canonicalizeReason(legacy)).toBe(canonical);
  });

  it.each([
    'holiday/blackout',
    'teacher-unavailable',
    'teacher-double-booked',
    'room-double-booked',
    'room-archived',
    'room-over-capacity',
  ] as const)('passes the canonical code %s through unchanged', (canonical) => {
    expect(canonicalizeReason(canonical)).toBe(canonical);
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeCutoffDate,
  isResetConfirmed,
  type CutoffChoice,
} from '../../../src/renderer/lib/planning/reset-planning';

describe('computeCutoffDate', () => {
  const cases: ReadonlyArray<{ today: string; choice: CutoffChoice; expected: string }> = [
    { today: '2026-08-21', choice: 'include-today', expected: '2026-08-21' },
    { today: '2026-08-21', choice: 'from-tomorrow', expected: '2026-08-22' },
    { today: '2026-08-31', choice: 'from-tomorrow', expected: '2026-09-01' },
    { today: '2026-12-31', choice: 'from-tomorrow', expected: '2027-01-01' },
    { today: '2028-02-28', choice: 'from-tomorrow', expected: '2028-02-29' },
  ];

  it.each(cases)('$today + $choice -> $expected', ({ today, choice, expected }) => {
    expect(computeCutoffDate(today, choice)).toBe(expected);
  });
});

describe('isResetConfirmed', () => {
  const expected = 'RÉINITIALISER';

  it('accepts the exact word', () => {
    expect(isResetConfirmed('RÉINITIALISER', expected)).toBe(true);
  });

  it('is case-insensitive and trims surrounding space', () => {
    expect(isResetConfirmed('  réinitialiser  ', expected)).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isResetConfirmed('', expected)).toBe(false);
  });

  it('rejects a different word', () => {
    expect(isResetConfirmed('supprimer', expected)).toBe(false);
  });

  it('matches an Arabic confirmation token', () => {
    expect(isResetConfirmed(' إعادة التعيين ', 'إعادة التعيين')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveFactureGroupee } from '../../../src/renderer/lib/invoices/facture-groupee';

describe('resolveFactureGroupee', () => {
  const month = '2026-08';

  it('blocks when the screen has no concrete month', () => {
    expect(resolveFactureGroupee(['par_1'], '')).toEqual({ kind: 'blocked', reason: 'no-month' });
    expect(resolveFactureGroupee(['par_1'], '2026')).toEqual({ kind: 'blocked', reason: 'no-month' });
  });

  it('blocks a student with no guardian', () => {
    expect(resolveFactureGroupee([], month)).toEqual({ kind: 'blocked', reason: 'no-guardian' });
  });

  it('fires directly for a single guardian', () => {
    expect(resolveFactureGroupee(['par_1'], month)).toEqual({ kind: 'single', parentId: 'par_1' });
  });

  it('asks the user to pick when there are several guardians', () => {
    expect(resolveFactureGroupee(['par_1', 'par_2'], month)).toEqual({
      kind: 'multiple',
      guardianIds: ['par_1', 'par_2'],
    });
  });

  it('checks the month before the guardians', () => {
    expect(resolveFactureGroupee([], '')).toEqual({ kind: 'blocked', reason: 'no-month' });
  });
});

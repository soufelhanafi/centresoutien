import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapFormulaWriteError } from '../../../src/renderer/lib/formulas/formula-write-error';

describe('mapFormulaWriteError', () => {
  it.each([
    'formula-immutable',
    'formula-not-found',
    'formula-subject-not-found',
    'formula-subject-inactive',
  ] as const)('decodes %s from the rejection message (the real IPC path)', (code) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    const rejection = new Error(`Error invoking remote method 'formula.create': Error: ${encoded}`);
    expect(mapFormulaWriteError(rejection)).toBe(code);
  });

  it('distinguishes the two FormulaSubjectUnavailableError reasons by their own decoded codes', () => {
    const notFound = encodeDomainError({ code: 'formula-subject-not-found', message: 'x' });
    const inactive = encodeDomainError({ code: 'formula-subject-inactive', message: 'x' });
    expect(mapFormulaWriteError(new Error(notFound))).toBe('formula-subject-not-found');
    expect(mapFormulaWriteError(new Error(inactive))).toBe('formula-subject-inactive');
  });

  it('returns null for an unrelated failure', () => {
    expect(mapFormulaWriteError(new Error('boom'))).toBeNull();
    expect(mapFormulaWriteError({ code: 'subject-in-use' })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { NotAuthenticatedError } from '../../../src/errors/auth-errors';
import { InsufficientRoleError } from '../../../src/errors/authorization-errors';
import { DomainError } from '../../../src/errors/plan-errors';

/**
 * The renderer's `errors.*` i18n keys are addressed by these stable codes
 * (SOU-267) — a rename here silently breaks the localized rejection lines,
 * so the codes are pinned as a contract.
 */
describe('authorization error codes', () => {
  it.each([
    { error: new NotAuthenticatedError(), code: 'not-authenticated' },
    { error: new InsufficientRoleError('admin', 'viewer'), code: 'insufficient-role' },
  ])('$error.name carries the stable code $code', ({ error, code }) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
  });
});

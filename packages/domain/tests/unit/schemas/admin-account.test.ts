import { describe, it, expect } from 'vitest';
import { adminCredentialsSchema } from '../../../src/schemas/admin-account';

/** Pull the first issue's code (our stable error code) out of a failed parse. */
function firstErrorCode(input: unknown): string | undefined {
  const result = adminCredentialsSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('adminCredentialsSchema', () => {
  it('accepts valid credentials and trims the username', () => {
    const parsed = adminCredentialsSchema.parse({ username: '  directrice ', password: 'Casa2026!' });
    expect(parsed).toEqual({ username: 'directrice', password: 'Casa2026!' });
  });

  const cases = [
    { name: 'short username', input: { username: 'ab', password: 'Casa2026!' }, code: 'username-too-short' },
    { name: 'short password', input: { username: 'directrice', password: 'Ab1' }, code: 'password-too-short' },
    { name: 'no lowercase', input: { username: 'directrice', password: 'CASA2026!' }, code: 'password-needs-lowercase' },
    { name: 'no uppercase', input: { username: 'directrice', password: 'casa2026!' }, code: 'password-needs-uppercase' },
    { name: 'no digit', input: { username: 'directrice', password: 'CasablancaX' }, code: 'password-needs-digit' },
  ] as const;

  it.each(cases)('rejects $name with code $code', ({ input, code }) => {
    expect(firstErrorCode(input)).toBe(code);
  });
});

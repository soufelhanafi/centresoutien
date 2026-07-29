import { describe, it, expect } from 'vitest';
import { loginInputSchema } from '../../../src/schemas/login';
import { PASSWORD_MAX } from '../../../src/schemas/admin-account';

describe('loginInputSchema', () => {
  it('defaults rememberDevice to false when omitted', () => {
    const parsed = loginInputSchema.parse({ username: 'directrice', password: 'x' });
    expect(parsed.rememberDevice).toBe(false);
  });

  it('trims the username', () => {
    const parsed = loginInputSchema.parse({ username: '  directrice ', password: 'x' });
    expect(parsed.username).toBe('directrice');
  });

  it('rejects an empty username with a stable error code', () => {
    const result = loginInputSchema.safeParse({ username: '  ', password: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('username-required');
    }
  });

  it('does not enforce password strength (an old weak password can still log in)', () => {
    expect(loginInputSchema.safeParse({ username: 'a', password: 'weak' }).success).toBe(true);
  });

  it('rejects a password longer than the max (never a correct password)', () => {
    const result = loginInputSchema.safeParse({
      username: 'a',
      password: 'x'.repeat(PASSWORD_MAX + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('password-too-long');
    }
  });
});

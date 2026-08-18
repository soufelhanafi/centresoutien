import { describe, it, expect } from 'vitest';
import { normalizeEmail, InvalidEmailError, EMAIL_MAX_LENGTH } from '../../../src/value-objects/email';

describe('normalizeEmail', () => {
  it.each([
    ['directrice@example.com', 'directrice@example.com'],
    ['  directrice@example.com  ', 'directrice@example.com'],
    ['Directrice@Example.COM', 'directrice@example.com'],
    ['first.last+tag@sub.domain.co.uk', 'first.last+tag@sub.domain.co.uk'],
    ["o'brien_1@centre-soutien.ma", "o'brien_1@centre-soutien.ma"],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['not-an-email'],
    ['missing@domain'], // no TLD dot
    ['@example.com'], // no local part
    ['spaces in@example.com'],
    ['double@@example.com'],
    ['trailingdot@example.com.'],
    ['a@-example.com'], // label cannot start with a hyphen
  ])('throws InvalidEmailError on %s', (raw) => {
    expect(() => normalizeEmail(raw)).toThrow(InvalidEmailError);
  });

  it('rejects an address longer than the RFC 5321 maximum', () => {
    const tooLong = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;
    expect(() => normalizeEmail(tooLong)).toThrow(InvalidEmailError);
  });

  it('carries the raw input on the thrown error for diagnostics', () => {
    try {
      normalizeEmail('bogus');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEmailError);
      expect((error as InvalidEmailError).raw).toBe('bogus');
    }
  });
});

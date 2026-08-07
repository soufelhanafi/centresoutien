import { describe, it, expect } from 'vitest';
import { normalizePhone, InvalidPhoneNumberError } from '../../../src/value-objects/phone-number';

describe('normalizePhone', () => {
  it.each([
    ['0612345678', '+212612345678'],
    ['06 12 34 56 78', '+212612345678'],
    ['06 12-34-56-78', '+212612345678'],
    ['0522-000000', '+212522000000'],
    ['+212612345678', '+212612345678'],
    ['00212612345678', '+212612345678'],
    ['212612345678', '+212612345678'],
    ['(0) 6-12-34-56-78', '+212612345678'],
    ['0712345678', '+212712345678'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    ['abc'],
    [''],
    ['   '],
    ['06123'], // too short
    ['06123456789'], // too long
    ['0112345678'], // invalid leading national digit
    ['+33612345678'], // unsupported (non-MA) country code
  ])('throws InvalidPhoneNumberError on %s', (raw) => {
    expect(() => normalizePhone(raw)).toThrow(InvalidPhoneNumberError);
  });

  it('exposes the offending raw input on the error', () => {
    try {
      normalizePhone('nope');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPhoneNumberError);
      expect((err as InvalidPhoneNumberError).raw).toBe('nope');
    }
  });

  it('E.164 variants of the same Moroccan number all collide onto one canonical form (SOU-92)', () => {
    const a = normalizePhone('06 12-34-56-78');
    const b = normalizePhone('0612345678');
    const c = normalizePhone('+212612345678');
    expect(a).toBe('+212612345678');
    expect(b).toBe('+212612345678');
    expect(c).toBe('+212612345678');
  });
});

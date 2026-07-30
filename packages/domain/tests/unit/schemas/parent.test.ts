import { describe, it, expect } from 'vitest';
import { parentInputSchema } from '../../../src/schemas/parent';

const base = { name: 'Ahmed Benali', phone: '0612345678', relation: 'pere' };

describe('parentInputSchema', () => {
  it('trims the name, normalizes the phone to E.164, and defaults optional fields', () => {
    const parsed = parentInputSchema.parse({ ...base, name: '  Ahmed Benali  ', phone: ' 06 12 34 56 78 ' });
    expect(parsed).toEqual({
      name: 'Ahmed Benali',
      phone: '+212612345678',
      email: null,
      relation: 'pere',
      whatsappOptIn: false,
    });
  });

  it('accepts each relation token', () => {
    for (const relation of ['pere', 'mere', 'tuteur', 'autre']) {
      expect(parentInputSchema.parse({ ...base, relation }).relation).toBe(relation);
    }
  });

  it('carries a valid email through and collapses a blank one to null', () => {
    expect(parentInputSchema.parse({ ...base, email: '  a@b.ma ' }).email).toBe('a@b.ma');
    expect(parentInputSchema.parse({ ...base, email: '   ' }).email).toBeNull();
  });

  describe('phone (required, the matching anchor)', () => {
    it('rejects a blank phone with the "required" code', () => {
      const r = parentInputSchema.safeParse({ ...base, phone: '' });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.message === 'required')).toBe(true);
    });

    it('rejects a garbage phone with the "invalid-phone" code', () => {
      const r = parentInputSchema.safeParse({ ...base, phone: 'not-a-number' });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.message === 'invalid-phone')).toBe(true);
    });

    it('normalizes the various forms a director types to one E.164 value', () => {
      for (const raw of ['0612345678', '+212612345678', '00212612345678', '06 12-34-56-78']) {
        expect(parentInputSchema.parse({ ...base, phone: raw }).phone).toBe('+212612345678');
      }
    });
  });

  it('rejects an invalid relation with the "invalid-relation" code', () => {
    const r = parentInputSchema.safeParse({ ...base, relation: 'oncle' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === 'invalid-relation')).toBe(true);
  });

  it('is idempotent — re-parsing an already-parsed value does not throw (double-validated at IPC + use case)', () => {
    const once = parentInputSchema.parse({ ...base, email: '   ' }); // email → null
    expect(once.email).toBeNull();
    const twice = parentInputSchema.parse(once); // null email, E.164 phone fed back in
    expect(twice).toEqual(once);
  });

  it('rejects a blank name and a malformed email with stable codes', () => {
    expect(parentInputSchema.safeParse({ ...base, name: '   ' }).error?.issues[0]?.message).toBe('required');
    expect(
      parentInputSchema.safeParse({ ...base, email: 'nope' }).error?.issues.some((i) => i.message === 'invalid-email'),
    ).toBe(true);
  });
});

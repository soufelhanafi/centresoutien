import { describe, it, expect } from 'vitest';
import {
  centerProfileSchema,
  logoUploadSchema,
  CENTER_NAME_MAX,
  LOGO_MAX_BYTES,
} from '../../../src/schemas/center';

describe('centerProfileSchema', () => {
  it('trims fields, normalizes the phone to E.164, and requires a name', () => {
    const parsed = centerProfileSchema.parse({
      name: '  Centre  ',
      address: '  Rue X ',
      phone: ' 06 12 34 56 78 ',
      email: '  a@b.ma ',
    });
    expect(parsed).toEqual({
      name: 'Centre',
      address: 'Rue X',
      phone: '+212612345678',
      email: 'a@b.ma',
    });
  });

  it('normalizes a Moroccan local number to E.164 and passes an already-E.164 value through', () => {
    expect(centerProfileSchema.parse({ name: 'C', phone: '0612345678' }).phone).toBe('+212612345678');
    expect(centerProfileSchema.parse({ name: 'C', phone: '+212612345678' }).phone).toBe('+212612345678');
  });

  it('accepts a blank phone but rejects garbage with the "invalid-phone" code', () => {
    expect(centerProfileSchema.parse({ name: 'C', phone: '' }).phone).toBe('');
    const bad = centerProfileSchema.safeParse({ name: 'C', phone: 'abc' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.some((i) => i.message === 'invalid-phone')).toBe(true);
  });

  it('defaults optional contact fields to empty strings', () => {
    const parsed = centerProfileSchema.parse({ name: 'Centre' });
    expect(parsed).toEqual({ name: 'Centre', address: '', phone: '', email: '' });
  });

  it('rejects a blank name with the "required" code', () => {
    const result = centerProfileSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message === 'required')).toBe(true);
  });

  it('rejects an over-long name with the "too-long" code', () => {
    const result = centerProfileSchema.safeParse({ name: 'x'.repeat(CENTER_NAME_MAX + 1) });
    expect(result.error?.issues.some((i) => i.message === 'too-long')).toBe(true);
  });

  it('accepts a blank email but rejects a malformed one', () => {
    expect(centerProfileSchema.safeParse({ name: 'C', email: '' }).success).toBe(true);
    const bad = centerProfileSchema.safeParse({ name: 'C', email: 'nope' });
    expect(bad.error?.issues.some((i) => i.message === 'invalid-email')).toBe(true);
  });
});

describe('logoUploadSchema', () => {
  it('lower-cases and accepts a supported extension', () => {
    const parsed = logoUploadSchema.parse({ extension: 'JPG', byteLength: 10 });
    expect(parsed.extension).toBe('jpg');
  });

  it('rejects an unsupported extension', () => {
    const r = logoUploadSchema.safeParse({ extension: 'gif', byteLength: 10 });
    expect(r.error?.issues.some((i) => i.message === 'unsupported-logo-type')).toBe(true);
  });

  it('rejects a file over the ceiling', () => {
    const r = logoUploadSchema.safeParse({ extension: 'png', byteLength: LOGO_MAX_BYTES + 1 });
    expect(r.error?.issues.some((i) => i.message === 'logo-too-large')).toBe(true);
  });

  it('rejects a zero-byte file', () => {
    expect(logoUploadSchema.safeParse({ extension: 'png', byteLength: 0 }).success).toBe(false);
  });
});

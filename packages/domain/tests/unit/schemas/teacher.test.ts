import { describe, it, expect } from 'vitest';
import { teacherInputSchema } from '../../../src/schemas/teacher';

const base = {
  name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
  phone: '0612345678',
};

describe('teacherInputSchema', () => {
  it('trims the bilingual name, normalizes the phone, and defaults optional fields', () => {
    const parsed = teacherInputSchema.parse({
      name: { fr: '  Yassine Alaoui  ', ar: ' ياسين العلوي ' },
      phone: ' 06 12 34 56 78 ',
    });
    expect(parsed).toEqual({
      name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
      cin: null,
      phone: '+212612345678',
      email: null,
      subjectIds: [],
    });
  });

  it('carries valid niveau ids through and treats an omitted niveauIds as none', () => {
    expect(
      teacherInputSchema.parse({
        ...base,
        niveauIds: ['niv_00000000000000000000000001'],
      }).niveauIds,
    ).toEqual(['niv_00000000000000000000000001']);

    const omitted = teacherInputSchema.parse({ ...base, subjectIds: [] });
    expect(omitted.niveauIds).toBeUndefined();

    const r = teacherInputSchema.safeParse({ ...base, niveauIds: ['not-a-niveau'] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === 'invalid-id')).toBe(true);
  });

  it('carries valid cin + email through and collapses blanks to null', () => {
    expect(teacherInputSchema.parse({ ...base, cin: ' AB123 ' }).cin).toBe('AB123');
    expect(teacherInputSchema.parse({ ...base, cin: '   ' }).cin).toBeNull();
    expect(teacherInputSchema.parse({ ...base, email: '  a@b.ma ' }).email).toBe('a@b.ma');
    expect(teacherInputSchema.parse({ ...base, email: '   ' }).email).toBeNull();
  });

  it('accepts subject ids with the sub_ prefix and rejects malformed ones', () => {
    expect(
      teacherInputSchema.parse({ ...base, subjectIds: ['sub_00000000000000000000000001'] }).subjectIds,
    ).toEqual(['sub_00000000000000000000000001']);

    const r = teacherInputSchema.safeParse({ ...base, subjectIds: ['not-a-subject'] });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === 'invalid-id')).toBe(true);
  });

  describe('name (bilingual, required)', () => {
    it('rejects a blank FR or AR name with the "required" code', () => {
      const fr = teacherInputSchema.safeParse({ ...base, name: { fr: '  ', ar: 'ياسين' } });
      const ar = teacherInputSchema.safeParse({ ...base, name: { fr: 'Yassine', ar: '  ' } });
      expect(fr.success).toBe(false);
      expect(ar.success).toBe(false);
    });
  });

  describe('phone (required, the matching anchor)', () => {
    it('rejects a blank phone with the "required" code', () => {
      const r = teacherInputSchema.safeParse({ ...base, phone: '' });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.message === 'required')).toBe(true);
    });

    it('rejects a garbage phone with the "invalid-phone" code', () => {
      const r = teacherInputSchema.safeParse({ ...base, phone: 'not-a-number' });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.message === 'invalid-phone')).toBe(true);
    });

    it('normalizes the various forms a director types to one E.164 value', () => {
      for (const raw of ['0612345678', '+212612345678', '00212612345678', '06 12-34-56-78']) {
        expect(teacherInputSchema.parse({ ...base, phone: raw }).phone).toBe('+212612345678');
      }
    });
  });

  it('is idempotent — re-parsing an already-parsed value does not throw (double-validated at IPC + use case)', () => {
    const once = teacherInputSchema.parse({ ...base, cin: '   ', email: '   ' });
    expect(once.cin).toBeNull();
    expect(once.email).toBeNull();
    const twice = teacherInputSchema.parse(once);
    expect(twice).toEqual(once);
  });
});

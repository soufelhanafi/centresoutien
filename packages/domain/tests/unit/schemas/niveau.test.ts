import { describe, it, expect } from 'vitest';
import {
  niveauInputSchema,
  niveauUpdateInputSchema,
  NIVEAU_NAME_MAX,
  NIVEAU_CODE_MAX,
} from '../../../src/schemas/niveau';

/** First issue's code for a given input, or null when parsing succeeds. */
function firstCode(input: unknown): string | null {
  const result = niveauInputSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

describe('niveauInputSchema', () => {
  describe('happy path', () => {
    it('accepts a bilingual name + category and trims surrounding whitespace', () => {
      const result = niveauInputSchema.safeParse({
        name: { fr: '  2ème Bac SVT ', ar: ' الثانية باكالوريا  ' },
        category: 'lycee',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toEqual({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' });
        expect(result.data.code).toBeUndefined();
      }
    });

    it('accepts every category', () => {
      for (const category of ['primaire', 'college', 'lycee']) {
        expect(
          firstCode({ name: { fr: 'Niveau', ar: 'مستوى' }, category }),
        ).toBeNull();
      }
    });
  });

  describe('code', () => {
    it('trims and uppercases a supplied code', () => {
      const result = niveauInputSchema.safeParse({
        name: { fr: 'Niveau', ar: 'مستوى' },
        category: 'lycee',
        code: '  2bac-svt ',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.code).toBe('2BAC-SVT');
    });

    it.each(['', '   ', undefined])('treats %o as no code (undefined)', (code) => {
      const result = niveauInputSchema.safeParse({
        name: { fr: 'Niveau', ar: 'مستوى' },
        category: 'primaire',
        code,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.code).toBeUndefined();
    });

    const codeErrors = [
      { name: 'illegal space', code: '2 BAC', message: 'invalid-code' },
      { name: 'leading hyphen', code: '-SVT', message: 'invalid-code' },
      { name: 'illegal symbol', code: 'SVT!', message: 'invalid-code' },
      { name: 'over max length', code: 'X'.repeat(NIVEAU_CODE_MAX + 1), message: 'too-long' },
    ] as const;

    it.each(codeErrors)('rejects $name → "$message"', ({ code, message }) => {
      expect(firstCode({ name: { fr: 'Niveau', ar: 'مستوى' }, category: 'lycee', code })).toBe(message);
    });

    it('accepts a code exactly at the max length', () => {
      expect(
        firstCode({ name: { fr: 'Niveau', ar: 'مستوى' }, category: 'lycee', code: 'X'.repeat(NIVEAU_CODE_MAX) }),
      ).toBeNull();
    });
  });

  describe('validation error codes', () => {
    const cases = [
      { name: 'empty fr', input: { name: { fr: '', ar: 'مستوى' } }, code: 'required' },
      { name: 'empty ar', input: { name: { fr: 'Niveau', ar: '' } }, code: 'required' },
      { name: 'whitespace-only fr', input: { name: { fr: '   ', ar: 'مستوى' } }, code: 'required' },
      {
        name: 'fr over max length',
        input: { name: { fr: 'x'.repeat(NIVEAU_NAME_MAX + 1), ar: 'مستوى' } },
        code: 'too-long',
      },
      {
        name: 'ar over max length',
        input: { name: { fr: 'Niveau', ar: ' x'.repeat(NIVEAU_NAME_MAX + 1) } },
        code: 'too-long',
      },
      {
        name: 'unknown category',
        input: { name: { fr: 'Niveau', ar: 'مستوى' }, category: 'university' },
        code: 'invalid-category',
      },
    ] as const;

    it.each(cases)('$name → "$code"', ({ input, code }) => {
      expect(firstCode(input)).toBe(code);
    });
  });

  it('accepts a name exactly at the max length', () => {
    expect(
      firstCode({ name: { fr: 'x'.repeat(NIVEAU_NAME_MAX), ar: 'ي'.repeat(NIVEAU_NAME_MAX) }, category: 'college' }),
    ).toBeNull();
  });
});

describe('niveauUpdateInputSchema', () => {
  it('requires the active flag alongside the editable fields', () => {
    const result = niveauUpdateInputSchema.safeParse({
      name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' },
      category: 'lycee',
      active: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing active flag', () => {
    const result = niveauUpdateInputSchema.safeParse({
      name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' },
      category: 'lycee',
    });
    expect(result.success).toBe(false);
  });
});

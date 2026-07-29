import { describe, it, expect } from 'vitest';
import { subjectInputSchema, SUBJECT_NAME_MAX } from '../../../src/schemas/subject';

/** First issue's code for a given input, or null when parsing succeeds. */
function firstCode(input: unknown): string | null {
  const result = subjectInputSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

describe('subjectInputSchema', () => {
  describe('happy path', () => {
    it('accepts a bilingual name and trims surrounding whitespace', () => {
      const result = subjectInputSchema.safeParse({
        name: { fr: '  Mathématiques ', ar: ' الرياضيات  ' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
      }
    });
  });

  describe('validation error codes', () => {
    const cases = [
      { name: 'empty fr', input: { name: { fr: '', ar: 'الرياضيات' } }, code: 'required' },
      { name: 'empty ar', input: { name: { fr: 'Maths', ar: '' } }, code: 'required' },
      { name: 'whitespace-only fr', input: { name: { fr: '   ', ar: 'الرياضيات' } }, code: 'required' },
      {
        name: 'fr over max length',
        input: { name: { fr: 'x'.repeat(SUBJECT_NAME_MAX + 1), ar: 'الرياضيات' } },
        code: 'too-long',
      },
      {
        name: 'ar over max length',
        input: { name: { fr: 'Maths', ar: ' x'.repeat(SUBJECT_NAME_MAX + 1) } },
        code: 'too-long',
      },
    ] as const;

    it.each(cases)('$name → "$code"', ({ input, code }) => {
      expect(firstCode(input)).toBe(code);
    });
  });

  it('accepts a name exactly at the max length', () => {
    expect(firstCode({ name: { fr: 'x'.repeat(SUBJECT_NAME_MAX), ar: 'ي'.repeat(SUBJECT_NAME_MAX) } })).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { formulaInputSchema, FORMULA_NAME_MAX } from '../../../src/schemas/formula';

const MATH = 'sub_00000000000000000000000003';
const PHYS = 'sub_00000000000000000000000004';

function firstCode(input: unknown): string | null {
  const result = formulaInputSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    subjectIds: [MATH, PHYS],
    priceMad: 35000,
    kind: 'regular',
    ...overrides,
  };
}

describe('formulaInputSchema', () => {
  it('accepts a valid bundle and trims the bilingual name', () => {
    const result = formulaInputSchema.safeParse(
      validInput({ name: { fr: '  Math + Physique ', ar: '  رياضيات وفيزياء  ' } }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toEqual({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
      expect(result.data.subjectIds).toEqual([MATH, PHYS]);
      expect(result.data.priceMad).toBe(35000);
      expect(result.data.kind).toBe('regular');
    }
  });

  it('accepts the exam-prep kind', () => {
    expect(formulaInputSchema.safeParse(validInput({ kind: 'exam-prep' })).success).toBe(true);
  });

  it('accepts a name exactly at the max length', () => {
    expect(
      firstCode(
        validInput({ name: { fr: 'x'.repeat(FORMULA_NAME_MAX), ar: 'ي'.repeat(FORMULA_NAME_MAX) } }),
      ),
    ).toBeNull();
  });

  // SOU-271: AR is optional data entry — a formula created with an empty AR name
  // is valid and keeps '' (this is what makes a FR-only invoice line generate).
  it.each(['', '   '])('accepts an empty AR name (FR-only entry): %o', (ar) => {
    const result = formulaInputSchema.safeParse(validInput({ name: { fr: 'Math', ar } }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name.ar).toBe('');
  });

  describe('validation error codes', () => {
    const cases = [
      { name: 'empty fr name', input: validInput({ name: { fr: '', ar: 'رياضيات' } }), code: 'required' },
      {
        name: 'fr name over max length',
        input: validInput({ name: { fr: 'x'.repeat(FORMULA_NAME_MAX + 1), ar: 'رياضيات' } }),
        code: 'too-long',
      },
      {
        name: 'ar name over max length',
        input: validInput({ name: { fr: 'Math', ar: 'ي'.repeat(FORMULA_NAME_MAX + 1) } }),
        code: 'too-long',
      },
      { name: 'no subjects', input: validInput({ subjectIds: [] }), code: 'subjects-required' },
      {
        name: 'a subjectId with the wrong prefix',
        input: validInput({ subjectIds: ['fml_00000000000000000000000009'] }),
        code: 'invalid-id',
      },
      { name: 'a negative price', input: validInput({ priceMad: -1 }), code: 'invalid-price' },
      { name: 'a zero price', input: validInput({ priceMad: 0 }), code: 'invalid-price' },
      { name: 'a non-integer price', input: validInput({ priceMad: 100.5 }), code: 'invalid-price' },
      { name: 'an unknown kind', input: validInput({ kind: 'advanced' }), code: 'invalid-kind' },
    ] as const;

    it.each(cases)('$name → "$code"', ({ input, code }) => {
      expect(firstCode(input)).toBe(code);
    });
  });
});

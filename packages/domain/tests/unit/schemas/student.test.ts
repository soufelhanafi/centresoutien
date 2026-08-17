import { describe, it, expect } from 'vitest';
import {
  studentInputSchema,
  isCalendarDate,
  STUDENT_NAME_MAX,
  STUDENT_LEVEL_MAX,
  STUDENT_SCHOOL_MAX,
  STUDENT_NOTES_MAX,
} from '../../../src/schemas/student';

const base = {
  name: { fr: 'Yassine', ar: 'ياسين' },
  birthDate: '2012-05-03',
  level: '3AC',
};

describe('studentInputSchema', () => {
  it('parses a minimal valid input and applies optional defaults', () => {
    const parsed = studentInputSchema.parse(base);
    expect(parsed.school).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.guardianIds).toEqual([]);
  });

  it('trims the bilingual name and level', () => {
    const parsed = studentInputSchema.parse({ ...base, name: { fr: '  Sara ', ar: ' سارة ' }, level: '  Bac ' });
    expect(parsed.name).toEqual({ fr: 'Sara', ar: 'سارة' });
    expect(parsed.level).toBe('Bac');
  });

  it('collapses blank optional text to null', () => {
    const parsed = studentInputSchema.parse({ ...base, school: '   ', notes: '' });
    expect(parsed.school).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it.each([
    ['blank fr name', { ...base, name: { fr: '  ', ar: 'ياسين' } }],
    ['blank ar name', { ...base, name: { fr: 'Yassine', ar: '' } }],
    ['name too long', { ...base, name: { fr: 'x'.repeat(STUDENT_NAME_MAX + 1), ar: 'ياسين' } }],
    ['level too long', { ...base, level: 'x'.repeat(STUDENT_LEVEL_MAX + 1) }],
    ['school too long', { ...base, school: 'x'.repeat(STUDENT_SCHOOL_MAX + 1) }],
    ['notes too long', { ...base, notes: 'x'.repeat(STUDENT_NOTES_MAX + 1) }],
    ['non-date birthDate', { ...base, birthDate: '03/05/2012' }],
    ['impossible birthDate', { ...base, birthDate: '2011-02-30' }],
    ['bad month', { ...base, birthDate: '2012-13-01' }],
    ['guardian id without prefix', { ...base, guardianIds: ['abc'] }],
  ])('rejects %s', (_label, input) => {
    expect(studentInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts well-formed guardian ids', () => {
    const parsed = studentInputSchema.parse({
      ...base,
      guardianIds: ['prt_00000000000000000000000001'],
    });
    expect(parsed.guardianIds).toEqual(['prt_00000000000000000000000001']);
  });
});

describe('isCalendarDate', () => {
  it.each(['2012-05-03', '2000-02-29', '2024-12-31'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each(['2011-02-29', '2012-00-10', '2012-13-01', '2012-05-32', '2012-5-3', 'nope', ''])(
    'rejects %s',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});

import { describe, it, expect } from 'vitest';
import {
  normalizeNaturalKey,
  normalizeNameForMatch,
  buildStudentNaturalKey,
  buildTeacherNaturalKey,
} from '../../../src/policies/natural-key';
import type { CenterCode } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;

describe('normalizeNaturalKey', () => {
  it('builds a {center}::{name}::{contact} key', () => {
    expect(normalizeNaturalKey({ centerCode: CENTER, fullName: 'Ahmed Benali', contact: '+212612345678' })).toBe(
      'CS-CASA-001::ahmed-benali::+212612345678',
    );
  });

  it('strips diacritics and lower-cases the name so accented spellings collide', () => {
    const a = normalizeNaturalKey({ centerCode: CENTER, fullName: 'Salwa EL Amrani', contact: '+212600000000' });
    const b = normalizeNaturalKey({ centerCode: CENTER, fullName: 'salwa el amrani', contact: '+212600000000' });
    expect(a).toBe(b);
  });

  it('drops punctuation but keeps Arabic letters', () => {
    expect(normalizeNaturalKey({ centerCode: CENTER, fullName: "O'Brien", contact: '+212611111111' })).toContain(
      '::obrien::',
    );
    // Arabic "بناني" is not in the transliteration table, so it survives verbatim
    // next to the transliterated "محمد" (SOU-92: only known names collide).
    expect(
      normalizeNaturalKey({ centerCode: CENTER, fullName: 'محمد بناني', contact: '+212611111111' }),
    ).toContain('::mohamed-بناني::');
  });

  it('is scoped by center — the same person in two centers gets distinct keys', () => {
    const casa = normalizeNaturalKey({ centerCode: CENTER, fullName: 'Ahmed', contact: '+212612345678' });
    const rabat = normalizeNaturalKey({ centerCode: 'CS-RABAT-001' as CenterCode, fullName: 'Ahmed', contact: '+212612345678' });
    expect(casa).not.toBe(rabat);
  });

  it('a shared family phone with different names yields different keys (both keepable)', () => {
    const father = normalizeNaturalKey({ centerCode: CENTER, fullName: 'Ahmed Benali', contact: '+212612345678' });
    const mother = normalizeNaturalKey({ centerCode: CENTER, fullName: 'Salma Benali', contact: '+212612345678' });
    expect(father).not.toBe(mother);
  });

  it('same name + same phone in one center collides (a genuine duplicate)', () => {
    const first = normalizeNaturalKey({ centerCode: CENTER, fullName: 'Ahmed Benali', contact: '+212612345678' });
    const again = normalizeNaturalKey({ centerCode: CENTER, fullName: ' Ahmed  Benali ', contact: '+212612345678' });
    expect(first).toBe(again);
  });
});

describe('buildStudentNaturalKey', () => {
  const name = { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' };

  it('delegates to normalizeNaturalKey with the FR+AR name and birth date as contact', () => {
    const key = buildStudentNaturalKey({ centerCode: CENTER, name, birthDate: '2012-05-03' });
    expect(key).toBe(
      normalizeNaturalKey({
        centerCode: CENTER,
        fullName: `${name.fr} ${name.ar}`,
        contact: '2012-05-03',
      }),
    );
    expect(key.startsWith('CS-CASA-001::')).toBe(true);
  });

  it('gives two children with the same name but different birth dates different keys', () => {
    const a = buildStudentNaturalKey({ centerCode: CENTER, name, birthDate: '2012-05-03' });
    const b = buildStudentNaturalKey({ centerCode: CENTER, name, birthDate: '2013-01-01' });
    expect(a).not.toBe(b);
  });

  it('is stable across name spacing/case variants', () => {
    const a = buildStudentNaturalKey({ centerCode: CENTER, name, birthDate: '2012-05-03' });
    const b = buildStudentNaturalKey({
      centerCode: CENTER,
      name: { fr: '  Yassine   Alaoui ', ar: ' ياسين  العلوي ' },
      birthDate: '2012-05-03',
    });
    expect(a).toBe(b);
  });
});

describe('buildTeacherNaturalKey', () => {
  const name = { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' };

  it('delegates to normalizeNaturalKey with the FR+AR name and E.164 phone as contact', () => {
    const key = buildTeacherNaturalKey({ centerCode: CENTER, name, phone: '+212612345678' });
    expect(key).toBe(
      normalizeNaturalKey({
        centerCode: CENTER,
        fullName: `${name.fr} ${name.ar}`,
        contact: '+212612345678',
      }),
    );
    expect(key.startsWith('CS-CASA-001::')).toBe(true);
  });

  it('gives two teachers sharing a phone but with different names different keys', () => {
    const a = buildTeacherNaturalKey({ centerCode: CENTER, name, phone: '+212612345678' });
    const b = buildTeacherNaturalKey({
      centerCode: CENTER,
      name: { fr: 'Salma Idrissi', ar: 'سلمى الإدريسي' },
      phone: '+212612345678',
    });
    expect(a).not.toBe(b);
  });

  it('is stable across name spacing/case variants (immutable matching key)', () => {
    const a = buildTeacherNaturalKey({ centerCode: CENTER, name, phone: '+212612345678' });
    const b = buildTeacherNaturalKey({
      centerCode: CENTER,
      name: { fr: '  Yassine   Alaoui ', ar: ' ياسين  العلوي ' },
      phone: '+212612345678',
    });
    expect(a).toBe(b);
  });
});

describe('normalizeNameForMatch — Arabic↔Latin transliteration (SOU-92)', () => {
  const pairs = [
    // The ticket's required collision: Mohamed / Mohammed / محمد are one name.
    ['Mohamed', 'Mohammed'],
    ['Mohamed', 'محمد'],
    ['Mohammed', 'محمد'],
    // El-/Al- article attached or detached — one family name.
    ['El Amrani', 'Elamrani'],
    ['Elamrani', 'al Amrani'],
    // Known Arabic given names collide with their common French spelling.
    ['Yassine', 'ياسين'],
    ['Fatima', 'فاطمة'],
    ['Khadija', 'خديجة'],
    ['Karim', 'كريم'],
  ] as const;

  it.each(pairs)('"%s" and "%s" collapse to the same match key', (a, b) => {
    expect(normalizeNameForMatch(a)).toBe(normalizeNameForMatch(b));
  });

  it('Mohamed/Mohammed/محمد all land on the canonical "mohamed" key', () => {
    expect(normalizeNameForMatch('محمد')).toBe('mohamed');
    expect(normalizeNameForMatch('Mohammed')).toBe('mohamed');
  });

  it('is idempotent — running it twice never changes the key', () => {
    const inputs = ['Mohammed El Amrani', 'محمد العلوي', 'Yassine', 'Fatima-Zahra'];
    for (const input of inputs) {
      expect(normalizeNameForMatch(normalizeNameForMatch(input))).toBe(normalizeNameForMatch(input));
    }
  });

  it('never over-merges distinct names (the Fatima vs Fatima-Zahra guard)', () => {
    expect(normalizeNameForMatch('Fatima')).not.toBe(normalizeNameForMatch('Fatima-Zahra'));
    expect(normalizeNameForMatch('Amine')).not.toBe(normalizeNameForMatch('Amina'));
    expect(normalizeNameForMatch('Ali')).not.toBe(normalizeNameForMatch('Ala'));
  });

  it('keeps the parent phone anchor untouched in the naturalKey (no vowel-stripping of the contact)', () => {
    const key = normalizeNaturalKey({
      centerCode: CENTER,
      fullName: 'Mohammed El Amrani',
      contact: '+212600000000',
    });
    expect(key).toBe('CS-CASA-001::mohamed-elamrani::+212600000000');
  });
});

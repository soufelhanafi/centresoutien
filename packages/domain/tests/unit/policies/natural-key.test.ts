import { describe, it, expect } from 'vitest';
import { normalizeName, buildStudentNaturalKey } from '../../../src/policies/natural-key';
import type { CenterCode } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;

describe('normalizeName', () => {
  it('lowercases, strips diacritics, and removes separators', () => {
    expect(normalizeName('  Yassine   ALAOUI ')).toBe('yassinealaoui');
  });

  it('collapses spacing and punctuation variants to the same form', () => {
    expect(normalizeName('El Amrani')).toBe(normalizeName('El-Amrani'));
    expect(normalizeName('El Amrani')).toBe('elamrani');
    expect(normalizeName('Mohaméd')).toBe('mohamed');
  });

  it('keeps Arabic letters intact', () => {
    expect(normalizeName('ياسين العلوي')).toBe('ياسينالعلوي');
  });
});

describe('buildStudentNaturalKey', () => {
  const name = { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' };

  it('formats as centerCode::normalizedName::birthDate', () => {
    const key = buildStudentNaturalKey({ centerCode: CENTER, name, birthDate: '2012-05-03' });
    expect(key).toBe('CS-CASA-001::yassinealaoui-ياسينالعلوي::2012-05-03');
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
      name: { fr: '  yassine   alaoui ', ar: ' ياسين  العلوي ' },
      birthDate: '2012-05-03',
    });
    expect(a).toBe(b);
  });
});

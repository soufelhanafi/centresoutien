import { describe, it, expect } from 'vitest';
import { normalizeNaturalKey } from '../../../src/policies/natural-key';
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
    expect(
      normalizeNaturalKey({ centerCode: CENTER, fullName: 'محمد بناني', contact: '+212611111111' }),
    ).toContain('::محمد-بناني::');
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

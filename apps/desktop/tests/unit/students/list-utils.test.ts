import { describe, expect, it } from 'vitest';
import { deriveLevels, filterByLevel, filterByNiveau } from '../../../src/renderer/lib/students/list-utils';
import type { StudentView } from '../../../src/renderer/lib/students/student-view';

function student(id: string, level: string, niveauId: string | null = null): StudentView {
  return {
    id,
    name: { fr: `Élève ${id}`, ar: `تلميذ ${id}` },
    birthDate: '2010-01-01',
    level,
    niveauId,
    school: null,
    notes: null,
    guardianIds: [],
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const roster: StudentView[] = [
  student('a', '3AC', 'niv_1'),
  student('b', '2 Bac SM', 'niv_2'),
  student('c', '3AC', null),
];

describe('deriveLevels', () => {
  it('returns the distinct levels, sorted', () => {
    expect(deriveLevels(roster)).toEqual(['2 Bac SM', '3AC']);
  });

  it('handles an empty roster', () => {
    expect(deriveLevels([])).toEqual([]);
  });
});

describe('filterByLevel', () => {
  it('returns everything for the empty (all) filter', () => {
    expect(filterByLevel(roster, '')).toHaveLength(3);
  });

  it('keeps only students of the chosen level', () => {
    expect(filterByLevel(roster, '3AC').map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('filterByNiveau', () => {
  it('returns everything for the empty (all) filter', () => {
    expect(filterByNiveau(roster, '')).toHaveLength(3);
  });

  it('keeps only students of the chosen niveau', () => {
    expect(filterByNiveau(roster, 'niv_1').map((s) => s.id)).toEqual(['a']);
  });

  it('matches nothing when no student carries the niveau', () => {
    expect(filterByNiveau(roster, 'niv_unknown')).toHaveLength(0);
  });
});

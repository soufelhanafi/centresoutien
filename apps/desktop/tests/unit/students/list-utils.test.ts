import { describe, expect, it } from 'vitest';
import { deriveLevels, filterByLevel } from '../../../src/renderer/lib/students/list-utils';
import type { StudentView } from '../../../src/renderer/lib/students/student-view';

function student(id: string, level: string): StudentView {
  return {
    id,
    name: { fr: `Élève ${id}`, ar: `تلميذ ${id}` },
    birthDate: '2010-01-01',
    level,
    school: null,
    notes: null,
    guardianIds: [],
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const roster: StudentView[] = [student('a', '3AC'), student('b', '2 Bac SM'), student('c', '3AC')];

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

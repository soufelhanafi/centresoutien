import { describe, expect, it } from 'vitest';
import type { GroupRow } from '../../../src/renderer/lib/groups/group-view';
import {
  applyGroupFilters,
  EMPTY_GROUP_FILTERS,
  isFiltering,
  type GroupFilters,
} from '../../../src/renderer/components/group/group-filters';

function group(id: string, overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id,
    subjectId: 'sub_1',
    subjectName: { fr: 'Maths', ar: 'الرياضيات' },
    teacherId: null,
    teacherName: null,
    level: '3AC',
    niveauId: 'niv_1',
    capacity: 20,
    kind: 'regular',
    enrolledCount: 5,
    archived: false,
    ...overrides,
  };
}

const rows: GroupRow[] = [
  group('g1', { niveauId: 'niv_1' }),
  group('g2', { niveauId: 'niv_2', level: '2 Bac SM' }),
  group('g3', { niveauId: null }),
];

describe('isFiltering', () => {
  it('is false for the neutral state', () => {
    expect(isFiltering(EMPTY_GROUP_FILTERS)).toBe(false);
  });

  it('is true when a niveau filter is active', () => {
    expect(isFiltering({ ...EMPTY_GROUP_FILTERS, niveauId: 'niv_1' })).toBe(true);
  });
});

describe('applyGroupFilters', () => {
  it('returns everything for the neutral filters', () => {
    expect(applyGroupFilters(rows, EMPTY_GROUP_FILTERS)).toHaveLength(3);
  });

  it('keeps only groups of the chosen niveau', () => {
    const filters: GroupFilters = { ...EMPTY_GROUP_FILTERS, niveauId: 'niv_1' };
    expect(applyGroupFilters(rows, filters).map((g) => g.id)).toEqual(['g1']);
  });

  it('matches unassigned groups when filtering by a level no one holds', () => {
    const filters: GroupFilters = { ...EMPTY_GROUP_FILTERS, niveauId: 'niv_missing' };
    expect(applyGroupFilters(rows, filters)).toHaveLength(0);
  });

  it('combines the niveau filter with the level text filter', () => {
    const filters: GroupFilters = { ...EMPTY_GROUP_FILTERS, niveauId: 'niv_1', level: '3ac' };
    expect(applyGroupFilters(rows, filters).map((g) => g.id)).toEqual(['g1']);
  });
});

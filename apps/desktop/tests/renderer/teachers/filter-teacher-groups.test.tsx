import { describe, it, expect } from 'vitest';
import type { GroupRow } from '../../../src/renderer/lib/groups/group-view';
import {
  filterTeacherGroups,
  selectTeacherGroups,
  teacherGroupsKinds,
} from '../../../src/renderer/lib/teachers/filter-teacher-groups';

const MATH = { fr: 'Mathématiques', ar: 'الرياضيات' };
const PHYS = { fr: 'Physique', ar: 'الفيزياء' };

function group(over: Partial<GroupRow> = {}): GroupRow {
  return {
    id: 'grp_1',
    subjectId: 'sub_math',
    subjectName: MATH,
    teacherId: 'tch_1',
    teacherName: { fr: 'Prof', ar: 'أستاذ' },
    level: '2 Bac',
    niveauId: null,
    capacity: 20,
    kind: 'regular',
    enrolledCount: 12,
    archived: false,
    ...over,
  };
}

describe('selectTeacherGroups', () => {
  it('keeps only the groups led by the given teacher', () => {
    const groups = [
      group({ id: 'a', teacherId: 'tch_1' }),
      group({ id: 'b', teacherId: 'tch_2' }),
      group({ id: 'c', teacherId: null }),
    ];
    const result = selectTeacherGroups(groups, 'tch_1', 'fr');
    expect(result.map((g) => g.id)).toEqual(['a']);
  });

  it('sorts by localized subject then level', () => {
    const groups = [
      group({ id: 'phys', subjectName: PHYS, subjectId: 'sub_phys', level: '1 Bac' }),
      group({ id: 'math-2', subjectName: MATH, level: '2 Bac' }),
      group({ id: 'math-1', subjectName: MATH, level: '1 Bac' }),
    ];
    const result = selectTeacherGroups(groups, 'tch_1', 'fr');
    expect(result.map((g) => g.id)).toEqual(['math-1', 'math-2', 'phys']);
  });

  it('returns an empty list for a teacher who leads no group', () => {
    const result = selectTeacherGroups([group({ teacherId: 'tch_2' })], 'tch_1', 'fr');
    expect(result).toEqual([]);
  });
});

describe('filterTeacherGroups', () => {
  it('defaults to all when the filter is empty', () => {
    const groups = [group({ id: 'a' }), group({ id: 'b', kind: 'exam-prep' })];
    const result = filterTeacherGroups(groups, { nameQuery: '', kind: 'all' });
    expect(result).toHaveLength(2);
  });

  it('filters by kind', () => {
    const groups = [group({ id: 'a', kind: 'regular' }), group({ id: 'b', kind: 'exam-prep' })];
    expect(filterTeacherGroups(groups, { nameQuery: '', kind: 'exam-prep' }).map((g) => g.id)).toEqual(['b']);
    expect(filterTeacherGroups(groups, { nameQuery: '', kind: 'regular' }).map((g) => g.id)).toEqual(['a']);
  });

  it('searches the subject name (either script) and the level, composing with AND', () => {
    const groups = [
      group({ id: 'math', subjectName: MATH, level: '2 Bac' }),
      group({ id: 'phys', subjectName: PHYS, subjectId: 'sub_phys', level: '1 Bac', kind: 'exam-prep' }),
    ];
    expect(filterTeacherGroups(groups, { nameQuery: 'physique', kind: 'all' }).map((g) => g.id)).toEqual(['phys']);
    expect(filterTeacherGroups(groups, { nameQuery: 'الرياضيات', kind: 'all' }).map((g) => g.id)).toEqual(['math']);
    expect(filterTeacherGroups(groups, { nameQuery: '1 bac', kind: 'all' }).map((g) => g.id)).toEqual(['phys']);
    expect(filterTeacherGroups(groups, { nameQuery: 'physique', kind: 'regular' })).toHaveLength(0);
  });
});

describe('teacherGroupsKinds', () => {
  it('returns the distinct kinds present', () => {
    expect(teacherGroupsKinds([group({ kind: 'regular' })])).toEqual(['regular']);
    const both = teacherGroupsKinds([
      group({ id: 'a', kind: 'regular' }),
      group({ id: 'b', kind: 'exam-prep' }),
      group({ id: 'c', kind: 'regular' }),
    ]);
    expect([...both].sort()).toEqual(['exam-prep', 'regular']);
  });
});

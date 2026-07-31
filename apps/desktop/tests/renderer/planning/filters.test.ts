import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  deriveFilterOptions,
  hasActiveFilters,
  NO_FILTERS,
  type PlannerFilters,
} from '../../../src/renderer/lib/planning/filters';
import { session } from './_fixtures';

describe('deriveFilterOptions', () => {
  it('collects distinct teacher/room/level options, sorted by label', () => {
    const options = deriveFilterOptions([
      session({ teacherId: 't2', teacherName: 'Zineb', roomId: 'r2', roomName: 'Salle B', level: '2BAC' }),
      session({ teacherId: 't1', teacherName: 'Adil', roomId: 'r1', roomName: 'Salle A', level: '1BAC' }),
      session({ teacherId: 't1', teacherName: 'Adil', roomId: 'r1', roomName: 'Salle A', level: '1BAC' }),
    ]);
    expect(options.teachers).toEqual([
      { value: 't1', label: 'Adil' },
      { value: 't2', label: 'Zineb' },
    ]);
    expect(options.rooms).toEqual([
      { value: 'r1', label: 'Salle A' },
      { value: 'r2', label: 'Salle B' },
    ]);
    expect(options.levels).toEqual(['1BAC', '2BAC']);
  });

  it('omits a teacher option for unassigned sessions', () => {
    const options = deriveFilterOptions([session({ teacherId: null, teacherName: null })]);
    expect(options.teachers).toEqual([]);
    expect(options.rooms).toHaveLength(1);
  });
});

describe('applyFilters', () => {
  const week = [
    session({ id: 'a', teacherId: 't1', roomId: 'r1', level: '1BAC', kind: 'regular' }),
    session({ id: 'b', teacherId: 't2', roomId: 'r2', level: '2BAC', kind: 'exam-prep' }),
  ];

  it('returns the whole week under NO_FILTERS', () => {
    expect(applyFilters(week, NO_FILTERS)).toHaveLength(2);
  });

  it('narrows by teacher, room, level, and kind independently', () => {
    expect(applyFilters(week, { ...NO_FILTERS, teacherId: 't1' }).map((s) => s.id)).toEqual(['a']);
    expect(applyFilters(week, { ...NO_FILTERS, roomId: 'r2' }).map((s) => s.id)).toEqual(['b']);
    expect(applyFilters(week, { ...NO_FILTERS, level: '2BAC' }).map((s) => s.id)).toEqual(['b']);
    expect(applyFilters(week, { ...NO_FILTERS, kind: 'exam-prep' }).map((s) => s.id)).toEqual(['b']);
  });

  it('combines active filters conjunctively', () => {
    expect(applyFilters(week, { ...NO_FILTERS, teacherId: 't1', kind: 'exam-prep' })).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the empty selection and true once any facet is set', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    const cases: PlannerFilters[] = [
      { ...NO_FILTERS, teacherId: 't1' },
      { ...NO_FILTERS, roomId: 'r1' },
      { ...NO_FILTERS, level: '1BAC' },
      { ...NO_FILTERS, kind: 'exam-prep' },
    ];
    for (const c of cases) expect(hasActiveFilters(c)).toBe(true);
  });
});

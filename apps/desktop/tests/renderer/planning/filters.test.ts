import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  deriveRoomLevelOptions,
  hasActiveFilters,
  NO_FILTERS,
  type PlannerFilters,
} from '../../../src/renderer/lib/planning/filters';
import { session } from './_fixtures';

describe('deriveRoomLevelOptions', () => {
  it('collects distinct room/level options, sorted by label', () => {
    const options = deriveRoomLevelOptions(
      [
        session({ roomId: 'r2', roomName: 'Salle B', level: '2BAC' }),
        session({ roomId: 'r1', roomName: 'Salle A', level: '1BAC' }),
        session({ roomId: 'r1', roomName: 'Salle A', level: '1BAC' }),
      ],
      'Salle inconnue',
    );
    expect(options.rooms).toEqual([
      { value: 'r1', label: 'Salle A' },
      { value: 'r2', label: 'Salle B' },
    ]);
    expect(options.levels).toEqual(['1BAC', '2BAC']);
  });

  it('labels an archived/not-yet-synced room (roomName null) with the fallback', () => {
    const options = deriveRoomLevelOptions([session({ roomId: 'r9', roomName: null })], 'Salle inconnue');
    expect(options.rooms).toEqual([{ value: 'r9', label: 'Salle inconnue' }]);
  });

  it('omits a level option for a session with no live group (level null)', () => {
    const options = deriveRoomLevelOptions([session({ level: null })], 'Salle inconnue');
    expect(options.levels).toEqual([]);
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

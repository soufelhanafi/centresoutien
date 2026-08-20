import { describe, expect, it } from 'vitest';
import {
  reconcilePersistedPair,
  visibleGroupsForTeacher,
  visibleTeachersForGroup,
} from '../../../src/renderer/lib/planning/session-picker-filter';
import type {
  SessionGroupOption,
  SessionTeacherOption,
} from '../../../src/renderer/lib/planning/session-options';

const teacher = (id: string, subjectIds: string[]): SessionTeacherOption => ({
  id,
  name: { fr: id, ar: id },
  subjectIds,
});

const group = (id: string, subjectId: string): SessionGroupOption => ({
  id,
  subjectId,
  subjectName: { fr: subjectId, ar: subjectId },
  level: null,
  kind: 'regular',
});

const mathTeacher = teacher('tch_math', ['math', 'physics']);
const artTeacher = teacher('tch_art', ['art']);
const unclassifiedTeacher = teacher('tch_none', []);
const teachers = [mathTeacher, artTeacher, unclassifiedTeacher];

const mathGroup = group('grp_math', 'math');
const artGroup = group('grp_art', 'art');
const groups = [mathGroup, artGroup];

describe('visibleGroupsForTeacher — teacher-first filters groups', () => {
  it('keeps only groups whose subject the teacher teaches', () => {
    expect(visibleGroupsForTeacher(groups, teachers, 'tch_math')).toEqual([mathGroup]);
  });

  it('offers every group when no teacher is selected (unassigned)', () => {
    expect(visibleGroupsForTeacher(groups, teachers, null)).toEqual(groups);
  });

  it('offers no group for an unclassified teacher (empty subjectIds)', () => {
    expect(visibleGroupsForTeacher(groups, teachers, 'tch_none')).toEqual([]);
  });
});

describe('visibleTeachersForGroup — group-first filters teachers', () => {
  it('keeps only teachers who teach the group subject', () => {
    expect(visibleTeachersForGroup(teachers, groups, 'grp_math')).toEqual([mathTeacher]);
  });

  it('offers every teacher when no group is selected (unassigned)', () => {
    expect(visibleTeachersForGroup(teachers, groups, null)).toEqual(teachers);
  });

  it('hides the unclassified teacher once a subject-bearing group is selected', () => {
    const visible = visibleTeachersForGroup(teachers, groups, 'grp_art');
    expect(visible).toEqual([artTeacher]);
    expect(visible).not.toContain(unclassifiedTeacher);
  });

  it('shows the unclassified teacher when no group is selected', () => {
    expect(visibleTeachersForGroup(teachers, groups, null)).toContain(unclassifiedTeacher);
  });
});

describe('reconcilePersistedPair — stale persisted pair on drawer load (AC3)', () => {
  it('clears the teacher (keeps the group anchor) when the persisted pair is incompatible', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_math', 'grp_art')).toEqual({
      clearTeacher: true,
    });
  });

  it('clears an unclassified teacher persisted against a subject-bearing group', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_none', 'grp_math')).toEqual({
      clearTeacher: true,
    });
  });

  it('leaves a compatible persisted pair untouched', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_math', 'grp_math')).toEqual({
      clearTeacher: false,
    });
  });

  it('leaves the pair untouched when the teacher is unassigned', () => {
    expect(reconcilePersistedPair(teachers, groups, null, 'grp_art')).toEqual({
      clearTeacher: false,
    });
  });

  it('leaves the pair untouched when the group is unassigned', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_math', null)).toEqual({
      clearTeacher: false,
    });
  });

  it('keeps a teacher absent from the active list (archived/unknown), not a mismatch', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_archived', 'grp_math')).toEqual({
      clearTeacher: false,
    });
  });

  it('keeps the pair when the persisted group is absent from the list', () => {
    expect(reconcilePersistedPair(teachers, groups, 'tch_math', 'grp_unknown')).toEqual({
      clearTeacher: false,
    });
  });
});

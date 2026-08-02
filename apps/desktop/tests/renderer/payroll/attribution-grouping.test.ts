import { describe, expect, it } from 'vitest';
import { groupBreakdownByTeacher } from '../../../src/renderer/lib/payroll/attribution-grouping';
import type { TeacherAttributionBreakdownEntryView } from '../../../src/renderer/lib/payroll/teacher-payout-view';

function entry(teacherId: string, subjectId: string, amountMad: number): TeacherAttributionBreakdownEntryView {
  return { teacherId, subjectId, amountMad };
}

describe('groupBreakdownByTeacher', () => {
  it('groups the flat month-wide rows by teacherId, preserving row order within a teacher', () => {
    const breakdown = [
      entry('tch_1', 'sub_math', 17500),
      entry('tch_2', 'sub_math', 20000),
      entry('tch_1', 'sub_physics', 17500),
    ];

    const grouped = groupBreakdownByTeacher(breakdown);

    expect(grouped.get('tch_1')).toEqual([entry('tch_1', 'sub_math', 17500), entry('tch_1', 'sub_physics', 17500)]);
    expect(grouped.get('tch_2')).toEqual([entry('tch_2', 'sub_math', 20000)]);
  });

  it('returns an empty map for an empty breakdown', () => {
    expect(groupBreakdownByTeacher([]).size).toBe(0);
  });

  it('leaves a teacher with no attribution rows (e.g. fixed-monthly) absent from the map', () => {
    const grouped = groupBreakdownByTeacher([entry('tch_percentage', 'sub_math', 10000)]);
    expect(grouped.get('tch_fixed')).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildStudentScheduleIndex,
  studentDoubleBookingsForCandidate,
  type StudentScheduledBlock,
} from '../../../src/policies/student-schedule-conflict';
import type { StudentId } from '../../../src/entities/student';
import type { GroupId } from '../../../src/entities/group';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const MON: WeekdayIndex = 1;
const TUE: WeekdayIndex = 2;

const STUDENT_1 = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_2 = 'stu_00000000000000000000000002' as StudentId;
const MATH_A = 'grp_00000000000000000000000001' as GroupId;
const PC_A = 'grp_00000000000000000000000002' as GroupId;
const PC_B = 'grp_00000000000000000000000003' as GroupId;

const block = (over: Partial<StudentScheduledBlock> = {}): StudentScheduledBlock => ({
  groupId: MATH_A,
  dayOfWeek: MON,
  start: '19:00' as TimeOfDay,
  end: '20:30' as TimeOfDay,
  ...over,
});

describe('buildStudentScheduleIndex', () => {
  it('folds each group roster and its blocks into one schedule per student', () => {
    const index = buildStudentScheduleIndex(
      new Map([
        [MATH_A, [STUDENT_1, STUDENT_2]],
        [PC_A, [STUDENT_1]],
      ]),
      new Map([
        [MATH_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]],
        [PC_A, [{ dayOfWeek: TUE, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]],
      ]),
    );

    expect(index.get(STUDENT_1)).toEqual([
      { groupId: MATH_A, dayOfWeek: MON, start: '19:00', end: '20:30' },
      { groupId: PC_A, dayOfWeek: TUE, start: '19:00', end: '20:30' },
    ]);
    expect(index.get(STUDENT_2)).toEqual([{ groupId: MATH_A, dayOfWeek: MON, start: '19:00', end: '20:30' }]);
  });

  it('contributes nothing for a group with no scheduled blocks yet', () => {
    const index = buildStudentScheduleIndex(new Map([[MATH_A, [STUDENT_1]]]), new Map());
    expect(index.get(STUDENT_1)).toBeUndefined();
  });

  it('contributes nothing for a scheduled group with an empty roster', () => {
    const index = buildStudentScheduleIndex(
      new Map([[MATH_A, []]]),
      new Map([[MATH_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );
    expect(index.size).toBe(0);
  });
});

describe('studentDoubleBookingsForCandidate', () => {
  it('flags a student enrolled in both groups when the two groups overlap in time', () => {
    const index = buildStudentScheduleIndex(
      new Map([[PC_A, [STUDENT_1]]]),
      new Map([[PC_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );

    const conflicts = studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index);

    expect(conflicts).toEqual([
      { studentId: STUDENT_1, otherGroupId: PC_A, dayOfWeek: MON, start: '19:00', end: '20:30' },
    ]);
  });

  it('reports the exact reported scenario: 50 dual-subject students split across Math A / PC A', () => {
    const index = buildStudentScheduleIndex(
      new Map([[PC_A, [STUDENT_1, STUDENT_2]]]),
      new Map([[PC_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );

    const conflicts = studentDoubleBookingsForCandidate(
      block({ groupId: MATH_A, dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }),
      [STUDENT_1, STUDENT_2],
      index,
    );

    expect(conflicts.map((c) => c.studentId).sort()).toEqual([STUDENT_1, STUDENT_2].sort());
  });

  it('does not flag a student on a different weekday', () => {
    const index = buildStudentScheduleIndex(
      new Map([[PC_A, [STUDENT_1]]]),
      new Map([[PC_A, [{ dayOfWeek: TUE, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );

    expect(studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index)).toEqual([]);
  });

  it('does not flag a student whose other slot is adjacent, not overlapping', () => {
    const index = buildStudentScheduleIndex(
      new Map([[PC_A, [STUDENT_1]]]),
      new Map([[PC_A, [{ dayOfWeek: MON, start: '20:30' as TimeOfDay, end: '22:00' as TimeOfDay }]]]),
    );

    expect(studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index)).toEqual([]);
  });

  it('never flags a student against another block of the SAME candidate group', () => {
    const index = buildStudentScheduleIndex(
      new Map([[MATH_A, [STUDENT_1]]]),
      new Map([[MATH_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );

    expect(studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index)).toEqual([]);
  });

  it('does not flag a student not on the candidate roster', () => {
    const index = buildStudentScheduleIndex(
      new Map([[PC_A, [STUDENT_2]]]),
      new Map([[PC_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]]]),
    );

    expect(studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index)).toEqual([]);
  });

  it('flags every clashing other group when a student attends more than two', () => {
    const index = buildStudentScheduleIndex(
      new Map([
        [PC_A, [STUDENT_1]],
        [PC_B, [STUDENT_1]],
      ]),
      new Map([
        [PC_A, [{ dayOfWeek: MON, start: '19:00' as TimeOfDay, end: '20:30' as TimeOfDay }]],
        [PC_B, [{ dayOfWeek: MON, start: '19:30' as TimeOfDay, end: '21:00' as TimeOfDay }]],
      ]),
    );

    const conflicts = studentDoubleBookingsForCandidate(block({ groupId: MATH_A }), [STUDENT_1], index);

    expect(conflicts.map((c) => c.otherGroupId).sort()).toEqual([PC_A, PC_B].sort());
  });
});

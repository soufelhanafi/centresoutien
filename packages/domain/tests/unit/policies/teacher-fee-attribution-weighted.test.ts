import { describe, it, expect } from 'vitest';
import {
  TeacherFeeAttributionPolicy,
  splitLineAmount,
  type StudentLineAttributionInput,
} from '../../../src/policies/teacher-fee-attribution-policy';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import type { TeacherId } from '../../../src/entities/teacher';

const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const FR = 'sub_00000000000000000000000002' as SubjectId;
const AR = 'sub_00000000000000000000000003' as SubjectId;
const TEACHER_MATH = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_FR = 'tch_00000000000000000000000002' as TeacherId;
const TEACHER_AR = 'tch_00000000000000000000000003' as TeacherId;

describe('TeacherFeeAttributionPolicy — weighted split (SOU-298)', () => {
  it('splits by the per-subject weights, not equally (the ticket example)', () => {
    // 900 MAD (90000 centimes) Math+FR+AR formula priced Math 440 / FR 230 / AR 230.
    // Math must attribute 440 (weighted), NOT 300 (the old 900 ÷ 3 equal split).
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT,
        lineAmountMad: 90000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_MATH, weightMad: 44000 },
          { subjectId: FR, teacherId: TEACHER_FR, weightMad: 23000 },
          { subjectId: AR, teacherId: TEACHER_AR, weightMad: 23000 },
        ],
      },
    ];

    const byTeacher = new Map(
      TeacherFeeAttributionPolicy.attribute(lines).map((r) => [r.teacherId, r.attributedAmountMad]),
    );

    expect(byTeacher.get(TEACHER_MATH)).toBe(44000);
    expect(byTeacher.get(TEACHER_FR)).toBe(23000);
    expect(byTeacher.get(TEACHER_AR)).toBe(23000);
  });

  it('pro-rates the weighted split when the line is only partially collected', () => {
    // Half of 90000 collected = 45000, split by 440/230/230 weights.
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT,
        lineAmountMad: 45000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_MATH, weightMad: 44000 },
          { subjectId: FR, teacherId: TEACHER_FR, weightMad: 23000 },
          { subjectId: AR, teacherId: TEACHER_AR, weightMad: 23000 },
        ],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attribute(lines);
    const byTeacher = new Map(result.map((r) => [r.teacherId, r.attributedAmountMad]));

    // 45000 * 44000/90000 = 22000; 45000 * 23000/90000 = 11500 each; sum back to 45000.
    expect(byTeacher.get(TEACHER_MATH)).toBe(22000);
    expect(byTeacher.get(TEACHER_FR)).toBe(11500);
    expect(byTeacher.get(TEACHER_AR)).toBe(11500);
    expect(result.reduce((s, r) => s + r.attributedAmountMad, 0)).toBe(45000);
  });

  it('falls back to the equal split when no subject carries a weight (un-priced formula)', () => {
    const shares = splitLineAmount({
      studentId: STUDENT,
      lineAmountMad: 90000,
      subjectAssignments: [
        { subjectId: MATH, teacherId: TEACHER_MATH },
        { subjectId: FR, teacherId: TEACHER_FR },
        { subjectId: AR, teacherId: TEACHER_AR },
      ],
    });

    expect(shares.map((s) => s.shareMad)).toEqual([30000, 30000, 30000]);
  });

  it('drops an unstaffed subject weighted share instead of redistributing it', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT,
        lineAmountMad: 90000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_MATH, weightMad: 44000 },
          { subjectId: FR, teacherId: null, weightMad: 23000 },
          { subjectId: AR, teacherId: TEACHER_AR, weightMad: 23000 },
        ],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attribute(lines);
    const byTeacher = new Map(result.map((r) => [r.teacherId, r.attributedAmountMad]));

    expect(byTeacher.get(TEACHER_MATH)).toBe(44000);
    expect(byTeacher.get(TEACHER_AR)).toBe(23000);
    // FR's 23000 stays unattributed, never folded into Math or AR.
    expect(result.reduce((s, r) => s + r.attributedAmountMad, 0)).toBe(67000);
  });
});

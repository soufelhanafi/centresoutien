import { describe, it, expect } from 'vitest';
import { SubjectRevenueAttributionPolicy } from '../../../src/policies/subject-revenue-attribution-policy';
import type { StudentLineAttributionInput } from '../../../src/policies/teacher-fee-attribution-policy';
import { EmptyAttributionLineError, InvalidAttributionAmountError } from '../../../src/errors/payroll-errors';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import type { TeacherId } from '../../../src/entities/teacher';

const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;

const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;
const CHEMISTRY = 'sub_00000000000000000000000003' as SubjectId;

const TEACHER_1 = 'tch_00000000000000000000000001' as TeacherId;

function sumMad(amounts: readonly { attributedAmountMad: number }[]): number {
  return amounts.reduce((sum, a) => sum + a.attributedAmountMad, 0);
}

describe('SubjectRevenueAttributionPolicy.attribute', () => {
  it('attributes the whole line to its one subject', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 20000,
        subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
      },
    ];

    const result = SubjectRevenueAttributionPolicy.attribute(lines);

    expect(result).toEqual([{ subjectId: MATH, attributedAmountMad: 20000 }]);
  });

  it('splits a line evenly across its subjects', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 30000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_1 },
          { subjectId: PHYSICS, teacherId: null },
          { subjectId: CHEMISTRY, teacherId: null },
        ],
      },
    ];

    const result = SubjectRevenueAttributionPolicy.attribute(lines);
    const bySubject = new Map(result.map((r) => [r.subjectId, r.attributedAmountMad]));

    expect(bySubject).toEqual(
      new Map([
        [MATH, 10000],
        [PHYSICS, 10000],
        [CHEMISTRY, 10000],
      ]),
    );
  });

  it('never drops an unstaffed subject’s share, unlike the teacher split', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 20000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_1 },
          { subjectId: PHYSICS, teacherId: null },
        ],
      },
    ];

    const result = SubjectRevenueAttributionPolicy.attribute(lines);

    expect(sumMad(result)).toBe(20000);
    expect(result.find((r) => r.subjectId === PHYSICS)?.attributedAmountMad).toBe(10000);
  });

  it('aggregates a subject’s revenue across multiple students and lines', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 20000,
        subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
      },
      {
        studentId: STUDENT_B,
        lineAmountMad: 15000,
        subjectAssignments: [{ subjectId: MATH, teacherId: null }],
      },
    ];

    const result = SubjectRevenueAttributionPolicy.attribute(lines);

    expect(result).toEqual([{ subjectId: MATH, attributedAmountMad: 35000 }]);
  });

  it.each([
    { name: 'divides exactly by 3', amount: 30000, count: 3 },
    { name: 'leaves a remainder over 3', amount: 10001, count: 3 },
    { name: 'a large realistic monthly total', amount: 987_654_321, count: 11 },
  ])('sum of attributed shares equals the original line — $name', ({ amount, count }) => {
    const subjectAssignments = Array.from({ length: count }, (_, index) => ({
      subjectId: `sub_${String(index).padStart(26, '0')}` as SubjectId,
      teacherId: null,
    }));
    const lines: StudentLineAttributionInput[] = [
      { studentId: STUDENT_A, lineAmountMad: amount, subjectAssignments },
    ];

    const result = SubjectRevenueAttributionPolicy.attribute(lines);

    expect(sumMad(result)).toBe(amount);
  });

  it('throws EmptyAttributionLineError when a line names zero subjects', () => {
    const lines: StudentLineAttributionInput[] = [
      { studentId: STUDENT_A, lineAmountMad: 20000, subjectAssignments: [] },
    ];

    expect(() => SubjectRevenueAttributionPolicy.attribute(lines)).toThrow(EmptyAttributionLineError);
  });

  it('throws InvalidAttributionAmountError for a negative amount', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: -100,
        subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
      },
    ];

    expect(() => SubjectRevenueAttributionPolicy.attribute(lines)).toThrow(InvalidAttributionAmountError);
  });

  it('returns an empty result for no lines', () => {
    expect(SubjectRevenueAttributionPolicy.attribute([])).toEqual([]);
  });
});

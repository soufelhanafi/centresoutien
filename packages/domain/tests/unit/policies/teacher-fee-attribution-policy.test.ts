import { describe, it, expect } from 'vitest';
import {
  TeacherFeeAttributionPolicy,
  type StudentLineAttributionInput,
} from '../../../src/policies/teacher-fee-attribution-policy';
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
const TEACHER_2 = 'tch_00000000000000000000000002' as TeacherId;
const TEACHER_3 = 'tch_00000000000000000000000003' as TeacherId;

function sumMad(amounts: readonly { attributedAmountMad: number }[]): number {
  return amounts.reduce((sum, a) => sum + a.attributedAmountMad, 0);
}

describe('TeacherFeeAttributionPolicy.attribute', () => {
  describe('single subject', () => {
    it('attributes the whole line to the one teacher', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 20000,
          subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result).toEqual([{ teacherId: TEACHER_1, attributedAmountMad: 20000 }]);
    });
  });

  describe('N-subject line', () => {
    it('splits a line evenly across its subjects when it divides exactly', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 30000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_2 },
            { subjectId: CHEMISTRY, teacherId: TEACHER_3 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(new Map(result.map((r) => [r.teacherId, r.attributedAmountMad]))).toEqual(
        new Map([
          [TEACHER_1, 10000],
          [TEACHER_2, 10000],
          [TEACHER_3, 10000],
        ]),
      );
    });

    it('distributes the leftover centimes to the first subjects, in order, when the split is uneven', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 35000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_2 },
            { subjectId: CHEMISTRY, teacherId: TEACHER_3 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);
      const byTeacher = new Map(result.map((r) => [r.teacherId, r.attributedAmountMad]));

      expect(byTeacher.get(TEACHER_1)).toBe(11667);
      expect(byTeacher.get(TEACHER_2)).toBe(11667);
      expect(byTeacher.get(TEACHER_3)).toBe(11666);
      expect(sumMad(result)).toBe(35000);
    });
  });

  describe('teacher teaching 0 / 1 / N subjects on a line', () => {
    it('a teacher who teaches none of the line subjects gets nothing from that line', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 20000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_2 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result.find((r) => r.teacherId === TEACHER_3)).toBeUndefined();
    });

    it('a teacher who teaches one of N subjects gets exactly one share', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 30000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_2 },
            { subjectId: CHEMISTRY, teacherId: TEACHER_3 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result.find((r) => r.teacherId === TEACHER_2)?.attributedAmountMad).toBe(10000);
    });

    it('a teacher who teaches all N subjects on a line collects the full line', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 30000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_1 },
            { subjectId: CHEMISTRY, teacherId: TEACHER_1 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result).toEqual([{ teacherId: TEACHER_1, attributedAmountMad: 30000 }]);
    });

    it('aggregates a teacher’s shares across multiple students that month', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 20000,
          subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
        },
        {
          studentId: STUDENT_B,
          lineAmountMad: 35000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: TEACHER_2 },
            { subjectId: CHEMISTRY, teacherId: TEACHER_3 },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);
      const byTeacher = new Map(result.map((r) => [r.teacherId, r.attributedAmountMad]));

      expect(byTeacher.get(TEACHER_1)).toBe(20000 + 11667);
    });
  });

  describe('unstaffed subject (teacherId: null)', () => {
    it('leaves the unstaffed subject’s share unattributed instead of redistributing it', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 30000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: TEACHER_1 },
            { subjectId: PHYSICS, teacherId: null },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result).toEqual([{ teacherId: TEACHER_1, attributedAmountMad: 15000 }]);
      expect(sumMad(result)).toBe(15000);
    });

    it('produces an empty result when every subject on a line is unstaffed', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 20000,
          subjectAssignments: [
            { subjectId: MATH, teacherId: null },
            { subjectId: PHYSICS, teacherId: null },
          ],
        },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(result).toEqual([]);
    });

    it('still divides by the full subject count, including unstaffed ones, not just the staffed count', () => {
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

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      // 30000 / 3 subjects = 10000 per subject, not 30000 / 1 staffed subject.
      expect(result).toEqual([{ teacherId: TEACHER_1, attributedAmountMad: 10000 }]);
    });
  });

  describe('rounding invariant', () => {
    it.each([
      { name: 'divides exactly by 2', amount: 40000, count: 2 },
      { name: 'divides exactly by 4', amount: 40000, count: 4 },
      { name: 'leaves a 1-centime remainder over 3', amount: 10000, count: 3 },
      { name: 'leaves a 2-centime remainder over 3', amount: 10001, count: 3 },
      { name: 'a single centime split across many subjects', amount: 1, count: 7 },
      { name: 'a zero-amount line', amount: 0, count: 5 },
      { name: 'a large realistic monthly total', amount: 987_654_321, count: 11 },
    ])('sum of attributed parts equals the original line — $name', ({ amount, count }) => {
      const subjectAssignments = Array.from({ length: count }, (_, index) => ({
        subjectId: `sub_${String(index).padStart(26, '0')}` as SubjectId,
        teacherId: `tch_${String(index).padStart(26, '0')}` as TeacherId,
      }));
      const lines: StudentLineAttributionInput[] = [
        { studentId: STUDENT_A, lineAmountMad: amount, subjectAssignments },
      ];

      const result = TeacherFeeAttributionPolicy.attribute(lines);

      expect(sumMad(result)).toBe(amount);
    });
  });

  describe('validation', () => {
    it('throws EmptyAttributionLineError when a line names zero subjects', () => {
      const lines: StudentLineAttributionInput[] = [
        { studentId: STUDENT_A, lineAmountMad: 20000, subjectAssignments: [] },
      ];

      expect(() => TeacherFeeAttributionPolicy.attribute(lines)).toThrow(EmptyAttributionLineError);
    });

    it('throws InvalidAttributionAmountError for a negative amount', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: -100,
          subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
        },
      ];

      expect(() => TeacherFeeAttributionPolicy.attribute(lines)).toThrow(InvalidAttributionAmountError);
    });

    it('throws InvalidAttributionAmountError for a non-integer amount', () => {
      const lines: StudentLineAttributionInput[] = [
        {
          studentId: STUDENT_A,
          lineAmountMad: 100.5,
          subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
        },
      ];

      expect(() => TeacherFeeAttributionPolicy.attribute(lines)).toThrow(InvalidAttributionAmountError);
    });
  });

  it('returns an empty result for no lines', () => {
    expect(TeacherFeeAttributionPolicy.attribute([])).toEqual([]);
  });
});

describe('TeacherFeeAttributionPolicy.attributeBySubject', () => {
  it('keeps a teacher’s shares broken out by subject instead of collapsing to one total', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 30000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_1 },
          { subjectId: PHYSICS, teacherId: TEACHER_2 },
          { subjectId: CHEMISTRY, teacherId: TEACHER_3 },
        ],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attributeBySubject(lines);

    expect(result).toEqual(
      expect.arrayContaining([
        { teacherId: TEACHER_1, subjectId: MATH, attributedAmountMad: 10000 },
        { teacherId: TEACHER_2, subjectId: PHYSICS, attributedAmountMad: 10000 },
        { teacherId: TEACHER_3, subjectId: CHEMISTRY, attributedAmountMad: 10000 },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('aggregates the same teacher+subject pair across multiple lines', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 20000,
        subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
      },
      {
        studentId: STUDENT_B,
        lineAmountMad: 15000,
        subjectAssignments: [{ subjectId: MATH, teacherId: TEACHER_1 }],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attributeBySubject(lines);

    expect(result).toEqual([{ teacherId: TEACHER_1, subjectId: MATH, attributedAmountMad: 35000 }]);
  });

  it('keeps a teacher teaching two subjects on one line as two separate entries', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 30000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_1 },
          { subjectId: PHYSICS, teacherId: TEACHER_1 },
          { subjectId: CHEMISTRY, teacherId: TEACHER_2 },
        ],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attributeBySubject(lines);

    expect(result).toEqual(
      expect.arrayContaining([
        { teacherId: TEACHER_1, subjectId: MATH, attributedAmountMad: 10000 },
        { teacherId: TEACHER_1, subjectId: PHYSICS, attributedAmountMad: 10000 },
        { teacherId: TEACHER_2, subjectId: CHEMISTRY, attributedAmountMad: 10000 },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('drops an unstaffed subject’s share instead of emitting a null-teacher entry', () => {
    const lines: StudentLineAttributionInput[] = [
      {
        studentId: STUDENT_A,
        lineAmountMad: 30000,
        subjectAssignments: [
          { subjectId: MATH, teacherId: TEACHER_1 },
          { subjectId: PHYSICS, teacherId: null },
        ],
      },
    ];

    const result = TeacherFeeAttributionPolicy.attributeBySubject(lines);

    expect(result).toEqual([{ teacherId: TEACHER_1, subjectId: MATH, attributedAmountMad: 15000 }]);
  });

  it('throws EmptyAttributionLineError when a line names zero subjects', () => {
    const lines: StudentLineAttributionInput[] = [
      { studentId: STUDENT_A, lineAmountMad: 20000, subjectAssignments: [] },
    ];

    expect(() => TeacherFeeAttributionPolicy.attributeBySubject(lines)).toThrow(EmptyAttributionLineError);
  });

  it('returns an empty result for no lines', () => {
    expect(TeacherFeeAttributionPolicy.attributeBySubject([])).toEqual([]);
  });
});

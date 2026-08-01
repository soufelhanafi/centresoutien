import { describe, it, expect } from 'vitest';
import { teacherTeachesSubject } from '../../../src/policies/teacher-teaches-subject';
import type { SubjectId } from '../../../src/entities/subject';

const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;
const CHEMISTRY = 'sub_00000000000000000000000003' as SubjectId;

describe('teacherTeachesSubject', () => {
  it('is true when the teacher teaches the subject', () => {
    expect(teacherTeachesSubject({ subjectIds: [MATH, PHYSICS] }, MATH)).toBe(true);
  });

  it('is true for any subject in the teacher list, not just the first', () => {
    expect(teacherTeachesSubject({ subjectIds: [MATH, PHYSICS] }, PHYSICS)).toBe(true);
  });

  it('is false when the subject is not among the teacher subjects', () => {
    expect(teacherTeachesSubject({ subjectIds: [MATH, PHYSICS] }, CHEMISTRY)).toBe(false);
  });

  it('is false when the teacher teaches nothing', () => {
    expect(teacherTeachesSubject({ subjectIds: [] }, MATH)).toBe(false);
  });
});

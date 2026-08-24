import { describe, it, expect } from 'vitest';
import {
  projectPayoutAmounts,
  sumAttributionByTeacher,
  flattenAttributionByTeacher,
} from '../../../src/policies/payroll-projection-policy';
import { newEnvelope } from '../../../src/entities/envelope';
import type { TeacherPayrollRule } from '../../../src/entities/teacher-payroll-rule';
import type { TeacherId } from '../../../src/entities/teacher';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-08-01T00:00:00Z'));

const TEACHER = 'tch_00000000000000000000000001' as TeacherId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;

function fixedRule(amountMad: number): TeacherPayrollRule {
  return {
    id: 'pyr_00000000000000000000000001' as TeacherPayrollRule['id'],
    ...envelope(),
    teacherId: TEACHER,
    kind: 'fixed-monthly',
    amountMad,
    startMonth: '2026-01',
    endMonth: null,
  };
}

function percentageRule(percent: number): TeacherPayrollRule {
  return {
    id: 'pyr_00000000000000000000000002' as TeacherPayrollRule['id'],
    ...envelope(),
    teacherId: TEACHER,
    kind: 'percentage-of-monthly-fees',
    percent,
    startMonth: '2026-01',
    endMonth: null,
  };
}

describe('projectPayoutAmounts', () => {
  it('projects the flat amount for both figures, no percent snapshot', () => {
    expect(projectPayoutAmounts(fixedRule(500000), 0, 0)).toEqual({
      ruleKind: 'fixed-monthly',
      encaisseMad: 500000,
      projeteMad: 500000,
      percentSnapshot: null,
    });
  });

  it('applies the percent to the collected and projected bases independently', () => {
    expect(projectPayoutAmounts(percentageRule(30), 40000, 100000)).toEqual({
      ruleKind: 'percentage-of-monthly-fees',
      encaisseMad: 12000,
      projeteMad: 30000,
      percentSnapshot: 30,
    });
  });

  it('rounds each figure to whole centimes', () => {
    expect(projectPayoutAmounts(percentageRule(33), 10001, 20002)).toEqual({
      ruleKind: 'percentage-of-monthly-fees',
      encaisseMad: 3300, // 10001 * 33 / 100 = 3300.33 → 3300
      projeteMad: 6601, // 20002 * 33 / 100 = 6600.66 → 6601
      percentSnapshot: 33,
    });
  });
});

describe('sumAttributionByTeacher', () => {
  it('collapses each teacher’s subject amounts into a single total', () => {
    const byTeacherSubject = new Map<TeacherId, ReadonlyMap<SubjectId, number>>([
      [TEACHER, new Map([[MATH, 15000], [PHYSICS, 15000]])],
    ]);

    expect(sumAttributionByTeacher(byTeacherSubject).get(TEACHER)).toBe(30000);
  });

  it('returns an empty map for no input', () => {
    expect(sumAttributionByTeacher(new Map()).size).toBe(0);
  });
});

describe('flattenAttributionByTeacher', () => {
  it('flattens the teacher→subject→amount map into basis rows', () => {
    const byTeacherSubject = new Map<TeacherId, ReadonlyMap<SubjectId, number>>([
      [TEACHER, new Map([[MATH, 15000], [PHYSICS, 15000]])],
    ]);

    expect(flattenAttributionByTeacher(byTeacherSubject)).toEqual([
      { teacherId: TEACHER, subjectId: MATH, amountMad: 15000 },
      { teacherId: TEACHER, subjectId: PHYSICS, amountMad: 15000 },
    ]);
  });
});

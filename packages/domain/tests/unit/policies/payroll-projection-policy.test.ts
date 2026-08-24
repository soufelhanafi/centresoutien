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
  it.each([
    ['fixed-monthly flat amount', fixedRule(500000), 0, 0, 500000, 500000, null],
    ['percentage over both bases', percentageRule(30), 40000, 100000, 12000, 30000, 30],
    ['percentage rounds to whole centimes', percentageRule(33), 10001, 20002, 3300, 6601, 33],
  ])('%s', (_label, rule, collectedBaseMad, projectedBaseMad, expectedEncaisse, expectedProjete, expectedPercent) => {
    expect(projectPayoutAmounts(rule, collectedBaseMad, projectedBaseMad)).toEqual({
      ruleKind: rule.kind,
      encaisseMad: expectedEncaisse,
      projeteMad: expectedProjete,
      percentSnapshot: expectedPercent,
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

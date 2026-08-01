import { describe, it, expect } from 'vitest';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
} from '../../../src/entities/teacher-payroll-rule';
import type { TeacherId } from '../../../src/entities/teacher';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;
const clock = fakeClock('2026-01-01T00:00:00Z');

function base() {
  return {
    id: 'pyr_00000000000000000000000001' as TeacherPayrollRuleId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    teacherId: TEACHER_ID,
    startMonth: '2026-09',
    endMonth: null,
  };
}

/**
 * Exhaustive switch over `kind` — compiles only because the union is closed to
 * exactly these two members. If a third kind is ever added to
 * `TeacherPayrollRule` without updating this function, `rule` stops being
 * assignable to `never` in the default branch and the build fails: the
 * compile-time proof the ticket's "no third kind constructible" criterion asks
 * for.
 */
function monthlyAmountFor(rule: TeacherPayrollRule): number {
  switch (rule.kind) {
    case 'fixed-monthly':
      return rule.amountMad;
    case 'percentage-of-monthly-fees':
      return rule.percent;
    default: {
      const exhaustive: never = rule;
      return exhaustive;
    }
  }
}

describe('TeacherPayrollRule', () => {
  it('constructs a fixed-monthly rule', () => {
    const rule: TeacherPayrollRule = { ...base(), kind: 'fixed-monthly', amountMad: 300000 };
    expect(rule.kind).toBe('fixed-monthly');
    expect(monthlyAmountFor(rule)).toBe(300000);
  });

  it('constructs a percentage-of-monthly-fees rule', () => {
    const rule: TeacherPayrollRule = {
      ...base(),
      kind: 'percentage-of-monthly-fees',
      percent: 40,
    };
    expect(rule.kind).toBe('percentage-of-monthly-fees');
    expect(monthlyAmountFor(rule)).toBe(40);
  });

  it('rejects a third kind at compile time', () => {
    const invalid: TeacherPayrollRule = {
      ...base(),
      // @ts-expect-error — 'flat-rate' is not a member of TeacherPayrollRuleKind
      kind: 'flat-rate',
      amountMad: 100,
    };
    expect(invalid).toBeDefined();
  });

});

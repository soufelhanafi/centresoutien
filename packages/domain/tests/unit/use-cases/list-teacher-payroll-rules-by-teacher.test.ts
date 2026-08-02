import { describe, it, expect, beforeEach } from 'vitest';
import {
  ListTeacherPayrollRulesByTeacher,
  type ListTeacherPayrollRulesByTeacherInput,
} from '../../../src/use-cases/list-teacher-payroll-rules-by-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { TeacherPayrollRule, TeacherPayrollRuleId } from '../../../src/entities/teacher-payroll-rule';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import { InMemoryTeacherPayrollRuleRepository } from '../fakes/in-memory-teacher-payroll-rule-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: TEACHER_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    naturalKey: `${CENTER}::yassine-alaoui::+212612345678`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: null,
    phone: '+212612345678' as PhoneNumber,
    email: null,
    subjectIds: [],
    active: true,
    ...overrides,
  };
}

function makeRule(overrides: Partial<TeacherPayrollRule> = {}): TeacherPayrollRule {
  return {
    id: 'pyr_00000000000000000000000001' as TeacherPayrollRuleId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    teacherId: TEACHER_ID,
    kind: 'fixed-monthly',
    amountMad: 300000,
    startMonth: '2026-09',
    endMonth: null,
    ...overrides,
  } as TeacherPayrollRule;
}

const input = (overrides: Partial<ListTeacherPayrollRulesByTeacherInput> = {}) =>
  ({ centerCode: CENTER, teacherId: TEACHER_ID, ...overrides }) satisfies ListTeacherPayrollRulesByTeacherInput;

describe('ListTeacherPayrollRulesByTeacher', () => {
  let rules: InMemoryTeacherPayrollRuleRepository;
  let teachers: InMemoryTeacherRepository;

  function build(plan: Plan): ListTeacherPayrollRulesByTeacher {
    return new ListTeacherPayrollRulesByTeacher(rules, teachers, new PlanPolicy(plan));
  }

  beforeEach(async () => {
    rules = new InMemoryTeacherPayrollRuleRepository();
    teachers = new InMemoryTeacherRepository();
    await teachers.save(makeTeacher());
  });

  describe('happy path', () => {
    it('returns every live rule for the teacher, newest start first', async () => {
      await rules.save(
        makeRule({ id: 'pyr_00000000000000000000000001' as TeacherPayrollRuleId, startMonth: '2026-09' }),
      );
      await rules.save(
        makeRule({ id: 'pyr_00000000000000000000000002' as TeacherPayrollRuleId, startMonth: '2027-01' }),
      );

      const result = await build(PLANS.pro).execute(input());

      expect(result.map((r) => r.id)).toEqual([
        'pyr_00000000000000000000000002',
        'pyr_00000000000000000000000001',
      ]);
    });

    it('returns an empty list when the teacher has no rules', async () => {
      const result = await build(PLANS.pro).execute(input());
      expect(result).toEqual([]);
    });

    it('excludes soft-deleted (tombstoned) rules', async () => {
      const rule = await (async () => {
        await rules.save(makeRule());
        return (await rules.listLiveByTeacher(TEACHER_ID))[0]!;
      })();
      await rules.softDelete(rule.id, new Date('2026-08-01T00:00:00Z'), USER);

      const result = await build(PLANS.pro).execute(input());
      expect(result).toEqual([]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(input())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });

    it('succeeds when the plan has payroll.teacher', async () => {
      await rules.save(makeRule());
      await expect(build(PLANS.pro).execute(input())).resolves.toHaveLength(1);
    });
  });

  describe('teacher resolution / tenant scoping', () => {
    it('throws TeacherNotFoundError for an unknown teacher', async () => {
      await expect(
        build(PLANS.pro).execute(input({ teacherId: 'tch_00000000000000000000000099' as TeacherId })),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherNotFoundError for a teacher in another center (no cross-tenant read)', async () => {
      const other = 'tch_00000000000000000000000006' as TeacherId;
      await teachers.save(makeTeacher({ id: other, centerCode: OTHER_CENTER, naturalKey: 'nk-x' }));
      await rules.save(makeRule({ teacherId: other }));

      await expect(build(PLANS.pro).execute(input({ teacherId: other }))).rejects.toBeInstanceOf(
        TeacherNotFoundError,
      );
    });

    it('throws TeacherNotFoundError for an archived (tombstoned) teacher', async () => {
      await teachers.softDelete(TEACHER_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build(PLANS.pro).execute(input())).rejects.toBeInstanceOf(TeacherNotFoundError);
    });
  });
});

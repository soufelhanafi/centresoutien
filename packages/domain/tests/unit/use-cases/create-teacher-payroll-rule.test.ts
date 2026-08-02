import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateTeacherPayrollRule,
  type CreateTeacherPayrollRuleInput,
} from '../../../src/use-cases/create-teacher-payroll-rule';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import { TooManyActivePayrollRulesError } from '../../../src/errors/payroll-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { IdGenerator } from '../../../src/ports/id-generator';
import { InMemoryTeacherPayrollRuleRepository } from '../fakes/in-memory-teacher-payroll-rule-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

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

// `Partial<Union>` only keeps keys common to every member, so overriding a
// kind-specific field (amountMad / percent) needs `Extract` to the branch first.
type FixedInput = Extract<CreateTeacherPayrollRuleInput, { kind: 'fixed-monthly' }>;
type PercentageInput = Extract<CreateTeacherPayrollRuleInput, { kind: 'percentage-of-monthly-fees' }>;

function fixedInput(overrides: Partial<FixedInput> = {}): CreateTeacherPayrollRuleInput {
  return {
    kind: 'fixed-monthly',
    teacherId: TEACHER_ID,
    amountMad: 300000,
    startMonth: '2026-09',
    endMonth: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function percentageInput(overrides: Partial<PercentageInput> = {}): CreateTeacherPayrollRuleInput {
  return {
    kind: 'percentage-of-monthly-fees',
    teacherId: TEACHER_ID,
    percent: 30,
    startMonth: '2026-09',
    endMonth: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateTeacherPayrollRule', () => {
  let rules: InMemoryTeacherPayrollRuleRepository;
  let teachers: InMemoryTeacherRepository;
  let ids: IdGenerator;

  function build(plan: Plan): CreateTeacherPayrollRule {
    return new CreateTeacherPayrollRule(
      rules,
      teachers,
      fakeClock('2026-07-31T10:00:00Z'),
      ids,
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    rules = new InMemoryTeacherPayrollRuleRepository();
    teachers = new InMemoryTeacherRepository();
    ids = fakeIds();
    await teachers.save(makeTeacher());
  });

  describe('happy path — fixed-monthly', () => {
    it('creates a rule with the pyr_ prefix, kind-specific field, and a fresh envelope', async () => {
      const rule = await build(PLANS.pro).execute(
        fixedInput({ startMonth: '2026-09', endMonth: '2027-06' }),
      );

      expect(rule.id).toMatch(/^pyr_/);
      expect(rule.teacherId).toBe(TEACHER_ID);
      expect(rule.kind).toBe('fixed-monthly');
      if (rule.kind === 'fixed-monthly') {
        expect(rule.amountMad).toBe(300000);
      }
      expect(rule.startMonth).toBe('2026-09');
      expect(rule.endMonth).toBe('2027-06');
      expect(rule.centerCode).toBe(CENTER);
      expect(rule.deviceOrigin).toBe(DEVICE);
      expect(rule.updatedBy).toBe(USER);
      expect(rule.createdAt).toEqual(new Date('2026-07-31T10:00:00Z'));
      expect(rule.updatedAt).toEqual(rule.createdAt);
      expect(rule.deletedAt).toBeNull();
      expect(rule.version).toBe(0);
    });
  });

  describe('happy path — percentage-of-monthly-fees', () => {
    it('creates a rule with the percent field set', async () => {
      const rule = await build(PLANS.pro).execute(percentageInput());
      expect(rule.kind).toBe('percentage-of-monthly-fees');
      if (rule.kind === 'percentage-of-monthly-fees') {
        expect(rule.percent).toBe(30);
      }
      expect(await rules.findById(rule.id)).toEqual(rule);
    });
  });

  describe('close-and-reopen (non-overlapping)', () => {
    it('permits a new rule starting after the prior one was closed', async () => {
      const first = await build(PLANS.pro).execute(
        fixedInput({ startMonth: '2026-09', endMonth: '2026-12' }),
      );
      const reopened = await build(PLANS.pro).execute(
        percentageInput({ startMonth: '2027-01', endMonth: null }),
      );
      expect(reopened.id).not.toBe(first.id);
      expect((await rules.listLiveByTeacher(TEACHER_ID)).length).toBe(2);
    });
  });

  describe('at-most-one-active-per-teacher invariant', () => {
    it('throws TooManyActivePayrollRulesError on a second overlapping rule', async () => {
      await build(PLANS.pro).execute(fixedInput({ startMonth: '2026-09', endMonth: null }));
      await expect(
        build(PLANS.pro).execute(fixedInput({ startMonth: '2026-10', endMonth: null })),
      ).rejects.toBeInstanceOf(TooManyActivePayrollRulesError);
      expect((await rules.listLiveByTeacher(TEACHER_ID)).length).toBe(1);
    });

    it('carries the teacherId on the error', async () => {
      await build(PLANS.pro).execute(fixedInput());
      await expect(build(PLANS.pro).execute(fixedInput())).rejects.toMatchObject({
        code: 'too-many-active-payroll-rules',
        teacherId: TEACHER_ID,
      });
    });

    it('rejects a percentage rule overlapping a live fixed-monthly rule (not split by kind)', async () => {
      await build(PLANS.pro).execute(fixedInput({ startMonth: '2026-09', endMonth: null }));
      await expect(
        build(PLANS.pro).execute(percentageInput({ startMonth: '2026-09', endMonth: null })),
      ).rejects.toBeInstanceOf(TooManyActivePayrollRulesError);
    });

    it('does not count a soft-deleted (tombstoned) rule toward the overlap', async () => {
      const first = await build(PLANS.pro).execute(fixedInput({ startMonth: '2026-09', endMonth: null }));
      await rules.softDelete(first.id, new Date('2026-08-01T00:00:00Z'), USER);
      const second = await build(PLANS.pro).execute(
        fixedInput({ startMonth: '2026-09', endMonth: null }),
      );
      expect(second.id).not.toBe(first.id);
      expect(await rules.findById(second.id)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(fixedInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect((await rules.listLiveByTeacher(TEACHER_ID)).length).toBe(0);
    });

    it('throws PlanFeatureUnavailableError for fixed-monthly when the plan lacks payroll.teacher.fixed', async () => {
      const planWithoutFixed: Plan = {
        id: 'pro',
        features: new Set<FeatureFlag>(['payroll.teacher', 'payroll.teacher.percentage']),
        limits: PLANS.pro.limits,
      };
      await expect(build(planWithoutFixed).execute(fixedInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });

    it('throws PlanFeatureUnavailableError for percentage when the plan lacks payroll.teacher.percentage', async () => {
      const planWithoutPercentage: Plan = {
        id: 'pro',
        features: new Set<FeatureFlag>(['payroll.teacher', 'payroll.teacher.fixed']),
        limits: PLANS.pro.limits,
      };
      await expect(build(planWithoutPercentage).execute(percentageInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });

    it('allows fixed-monthly on Essentiel-shaped plan lacking payroll.teacher.percentage', async () => {
      const fixedOnly: Plan = {
        id: 'pro',
        features: new Set<FeatureFlag>(['payroll.teacher', 'payroll.teacher.fixed']),
        limits: PLANS.pro.limits,
      };
      const rule = await build(fixedOnly).execute(fixedInput());
      expect(rule.kind).toBe('fixed-monthly');
    });
  });

  describe('teacher resolution / tenant scoping', () => {
    it('throws TeacherNotFoundError for an unknown teacher', async () => {
      await expect(
        build(PLANS.pro).execute(
          fixedInput({ teacherId: 'tch_00000000000000000000000099' as TeacherId }),
        ),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherNotFoundError for a teacher in another center (no cross-tenant rule)', async () => {
      const other = 'tch_00000000000000000000000006' as TeacherId;
      await teachers.save(makeTeacher({ id: other, centerCode: OTHER_CENTER, naturalKey: 'nk-x' }));
      await expect(
        build(PLANS.pro).execute(fixedInput({ teacherId: other })),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherNotFoundError for an archived (tombstoned) teacher', async () => {
      await teachers.softDelete(TEACHER_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build(PLANS.pro).execute(fixedInput())).rejects.toBeInstanceOf(
        TeacherNotFoundError,
      );
    });
  });

  describe('validation', () => {
    it('rejects a malformed teacher id', async () => {
      await expect(
        build(PLANS.pro).execute(fixedInput({ teacherId: 'not-an-id' as TeacherId })),
      ).rejects.toThrow();
    });

    it('rejects a non-positive amountMad for fixed-monthly', async () => {
      await expect(build(PLANS.pro).execute(fixedInput({ amountMad: 0 }))).rejects.toThrow();
    });

    it('rejects a non-integer amountMad for fixed-monthly', async () => {
      await expect(build(PLANS.pro).execute(fixedInput({ amountMad: 100.5 }))).rejects.toThrow();
    });

    it('rejects a percent above 100 for percentage-of-monthly-fees', async () => {
      await expect(build(PLANS.pro).execute(percentageInput({ percent: 101 }))).rejects.toThrow();
    });

    it('rejects a non-positive percent for percentage-of-monthly-fees', async () => {
      await expect(build(PLANS.pro).execute(percentageInput({ percent: 0 }))).rejects.toThrow();
    });

    it('rejects an invalid startMonth', async () => {
      await expect(build(PLANS.pro).execute(fixedInput({ startMonth: '2026-13' }))).rejects.toThrow();
    });

    it('rejects an endMonth before startMonth', async () => {
      await expect(
        build(PLANS.pro).execute(fixedInput({ startMonth: '2026-09', endMonth: '2026-08' })),
      ).rejects.toThrow();
    });

    it('accepts a single-month rule where endMonth equals startMonth', async () => {
      const rule = await build(PLANS.pro).execute(
        fixedInput({ startMonth: '2026-09', endMonth: '2026-09' }),
      );
      expect(rule.startMonth).toBe('2026-09');
      expect(rule.endMonth).toBe('2026-09');
    });
  });
});

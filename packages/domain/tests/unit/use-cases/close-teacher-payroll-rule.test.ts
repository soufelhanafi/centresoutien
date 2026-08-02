import { describe, it, expect, beforeEach } from 'vitest';
import { CloseTeacherPayrollRule } from '../../../src/use-cases/close-teacher-payroll-rule';
import { CreateTeacherPayrollRule } from '../../../src/use-cases/create-teacher-payroll-rule';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherPayrollRuleNotFoundError } from '../../../src/errors/payroll-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { TeacherPayrollRuleId } from '../../../src/entities/teacher-payroll-rule';
import { InMemoryTeacherPayrollRuleRepository } from '../fakes/in-memory-teacher-payroll-rule-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const OTHER_USER = 'usr_00000000000000000000000002' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeTeacher(): Teacher {
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
  };
}

describe('CloseTeacherPayrollRule', () => {
  let rules: InMemoryTeacherPayrollRuleRepository;
  let teachers: InMemoryTeacherRepository;
  let create: CreateTeacherPayrollRule;

  async function seedOpenRule(): Promise<TeacherPayrollRuleId> {
    const created = await create.execute({
      kind: 'fixed-monthly',
      teacherId: TEACHER_ID,
      amountMad: 300000,
      startMonth: '2026-09',
      endMonth: null,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    return created.id;
  }

  function close(plan: Plan, at = '2026-12-15T10:00:00Z'): CloseTeacherPayrollRule {
    return new CloseTeacherPayrollRule(rules, fakeClock(at), new PlanPolicy(plan));
  }

  beforeEach(async () => {
    rules = new InMemoryTeacherPayrollRuleRepository();
    teachers = new InMemoryTeacherRepository();
    create = new CreateTeacherPayrollRule(
      rules,
      teachers,
      fakeClock('2026-07-31T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.pro),
    );
    await teachers.save(makeTeacher());
  });

  describe('happy path', () => {
    it('caps endMonth, bumps updatedAt/updatedBy, and keeps identity fields', async () => {
      const id = await seedOpenRule();
      const closed = await close(PLANS.pro).execute({
        centerCode: CENTER,
        ruleId: id,
        endMonth: '2026-12',
        updatedBy: OTHER_USER,
      });

      expect(closed.endMonth).toBe('2026-12');
      expect(closed.updatedAt).toEqual(new Date('2026-12-15T10:00:00Z'));
      expect(closed.updatedBy).toBe(OTHER_USER);
      expect(closed.id).toBe(id);
      expect(closed.startMonth).toBe('2026-09');
      expect(closed.createdAt).toEqual(new Date('2026-07-31T10:00:00Z'));
      expect(closed.deletedAt).toBeNull();
    });

    it('persists the close so the rule reads back capped (a live tombstone-free row)', async () => {
      const id = await seedOpenRule();
      await close(PLANS.pro).execute({
        centerCode: CENTER,
        ruleId: id,
        endMonth: '2026-12',
        updatedBy: USER,
      });
      const found = await rules.findById(id);
      expect(found?.endMonth).toBe('2026-12');
    });

    it('close then reopen the next month is allowed by the overlap invariant', async () => {
      const id = await seedOpenRule();
      await close(PLANS.pro).execute({
        centerCode: CENTER,
        ruleId: id,
        endMonth: '2026-12',
        updatedBy: USER,
      });
      const reopened = await create.execute({
        kind: 'percentage-of-monthly-fees',
        teacherId: TEACHER_ID,
        percent: 25,
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });
      expect(reopened.id).not.toBe(id);
      expect((await rules.listLiveByTeacher(TEACHER_ID)).length).toBe(2);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const id = await seedOpenRule();
      const planWithout: Plan = {
        id: 'pro',
        features: new Set<FeatureFlag>(),
        limits: PLANS.pro.limits,
      };
      await expect(
        close(planWithout).execute({
          centerCode: CENTER,
          ruleId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws TeacherPayrollRuleNotFoundError for an unknown id', async () => {
      await expect(
        close(PLANS.pro).execute({
          centerCode: CENTER,
          ruleId: 'pyr_00000000000000000000000099' as TeacherPayrollRuleId,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(TeacherPayrollRuleNotFoundError);
    });

    it('throws TeacherPayrollRuleNotFoundError for a rule in another center', async () => {
      const id = await seedOpenRule();
      await expect(
        close(PLANS.pro).execute({
          centerCode: OTHER_CENTER,
          ruleId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(TeacherPayrollRuleNotFoundError);
    });

    it('throws TeacherPayrollRuleNotFoundError for an already soft-deleted rule', async () => {
      const id = await seedOpenRule();
      await rules.softDelete(id, new Date('2026-11-01T00:00:00Z'), USER);
      await expect(
        close(PLANS.pro).execute({
          centerCode: CENTER,
          ruleId: id,
          endMonth: '2026-12',
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(TeacherPayrollRuleNotFoundError);
    });
  });

  describe('validation', () => {
    it('rejects a malformed endMonth', async () => {
      const id = await seedOpenRule();
      await expect(
        close(PLANS.pro).execute({
          centerCode: CENTER,
          ruleId: id,
          endMonth: '2026-13',
          updatedBy: USER,
        }),
      ).rejects.toThrow();
    });
  });
});

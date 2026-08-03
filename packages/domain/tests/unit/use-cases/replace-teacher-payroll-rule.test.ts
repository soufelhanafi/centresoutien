import { describe, it, expect, beforeEach } from 'vitest';
import { ReplaceTeacherPayrollRule } from '../../../src/use-cases/replace-teacher-payroll-rule';
import { CreateTeacherPayrollRule } from '../../../src/use-cases/create-teacher-payroll-rule';
import { CloseTeacherPayrollRule } from '../../../src/use-cases/close-teacher-payroll-rule';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherPayrollRuleNotFoundError } from '../../../src/errors/payroll-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import { TooManyActivePayrollRulesError } from '../../../src/errors/payroll-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
} from '../../../src/entities/teacher-payroll-rule';
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

/** A repo whose `save` throws for one specific id — to simulate a create failure after the close. */
class FailingCreatePayrollRuleRepository extends InMemoryTeacherPayrollRuleRepository {
  constructor(private readonly failingId: TeacherPayrollRuleId) {
    super();
  }
  override async save(rule: TeacherPayrollRule): Promise<void> {
    if (rule.id === this.failingId) throw new Error('simulated create failure after close');
    return super.save(rule);
  }
}

describe('ReplaceTeacherPayrollRule', () => {
  let rules: InMemoryTeacherPayrollRuleRepository;
  let teachers: InMemoryTeacherRepository;
  let create: CreateTeacherPayrollRule;
  let close: CloseTeacherPayrollRule;

  function replace(): ReplaceTeacherPayrollRule {
    return new ReplaceTeacherPayrollRule(
      rules,
      teachers,
      fakeClock('2027-01-15T10:00:00Z'),
      fakeIds(100),
      new PlanPolicy(PLANS.pro),
    );
  }

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
    close = new CloseTeacherPayrollRule(
      rules,
      fakeClock('2026-12-15T10:00:00Z'),
      new PlanPolicy(PLANS.pro),
    );
    await teachers.save(makeTeacher());
  });

  describe('happy path', () => {
    it('closes the incumbent the month before and creates the replacement (one operation)', async () => {
      const activeId = await seedOpenRule();
      const { closed, created } = await replace().execute({
        kind: 'percentage-of-monthly-fees',
        teacherId: TEACHER_ID,
        percent: 25,
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        activeRuleId: activeId,
      });

      expect(closed.id).toBe(activeId);
      expect(closed.endMonth).toBe('2026-12');
      expect(closed.updatedBy).toBe(USER);

      expect(created.id).not.toBe(activeId);
      expect(created.kind).toBe('percentage-of-monthly-fees');
      expect(created.percent).toBe(25);
      expect(created.startMonth).toBe('2027-01');
      expect(created.endMonth).toBeNull();

      expect((await rules.findById(activeId))?.endMonth).toBe('2026-12');
      expect(await rules.findById(created.id)).not.toBeNull();
      expect((await rules.listLiveByTeacher(TEACHER_ID)).length).toBe(2);
    });

    it('yields two contiguous, non-overlapping ranges', async () => {
      const activeId = await seedOpenRule();
      const { created } = await replace().execute({
        kind: 'fixed-monthly',
        teacherId: TEACHER_ID,
        amountMad: 320000,
        startMonth: '2027-03',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
        activeRuleId: activeId,
      });
      const closed = (await rules.findById(activeId))!;
      expect(closed.endMonth).toBe('2027-02');
      expect(created.startMonth).toBe('2027-03');
    });
  });

  describe('overlap guard (at-most-one-active-per-teacher)', () => {
    it('rejects a replacement that overlaps a different live rule of the same teacher', async () => {
      const activeId = await seedOpenRule();
      await close.execute({ centerCode: CENTER, ruleId: activeId, endMonth: '2026-12', updatedBy: USER });
      await create.execute({
        kind: 'fixed-monthly',
        teacherId: TEACHER_ID,
        amountMad: 310000,
        startMonth: '2027-01',
        endMonth: null,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });

      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 330000,
          startMonth: '2027-02',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toBeInstanceOf(TooManyActivePayrollRulesError);
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws TeacherPayrollRuleNotFoundError for an unknown active rule', async () => {
      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: 'pyr_00000000000000000000000099' as TeacherPayrollRuleId,
        }),
      ).rejects.toBeInstanceOf(TeacherPayrollRuleNotFoundError);
    });

    it('throws TeacherNotFoundError when the active rule is in another center', async () => {
      const activeId = await seedOpenRule();
      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: OTHER_CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherPayrollRuleNotFoundError for an already soft-deleted active rule', async () => {
      const activeId = await seedOpenRule();
      await rules.softDelete(activeId, new Date('2026-11-01T00:00:00Z'), USER);
      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toBeInstanceOf(TeacherPayrollRuleNotFoundError);
    });

    it("throws TeacherNotFoundError when the new rule's teacher is another center", async () => {
      const activeId = await seedOpenRule();
      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: 'tch_00000000000000000000000009' as TeacherId,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });
  });


  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const activeId = await seedOpenRule();
      const planWithout: Plan = {
        id: 'pro',
        features: new Set<FeatureFlag>(),
        limits: PLANS.pro.limits,
      };
      const useCase = new ReplaceTeacherPayrollRule(
        rules,
        teachers,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithout),
      );
      await expect(
        useCase.execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('validation', () => {
    it('rejects a malformed startMonth', async () => {
      const activeId = await seedOpenRule();
      await expect(
        replace().execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-13',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('atomicity (SOU-141 done-when)', () => {
    it('a create failure after the close leaves the incumbent live, not closed-and-orphaned', async () => {
      const activeId = await seedOpenRule();
      const createdId = 'pyr_00000000000000000000000042' as TeacherPayrollRuleId;
      const failing = new FailingCreatePayrollRuleRepository(createdId);
      await failing.save((await rules.findById(activeId))!);
      await failing.save(makeTeacher());
      const useCase = new ReplaceTeacherPayrollRule(
        failing,
        teachers,
        fakeClock('2027-01-15T10:00:00Z'),
        fakeIds(42),
        new PlanPolicy(PLANS.pro),
      );

      await expect(
        useCase.execute({
          kind: 'fixed-monthly',
          teacherId: TEACHER_ID,
          amountMad: 300000,
          startMonth: '2027-01',
          endMonth: null,
          centerCode: CENTER,
          deviceOrigin: DEVICE,
          updatedBy: USER,
          activeRuleId: activeId,
        }),
      ).rejects.toThrow('simulated create failure after close');

      const incumbent = await failing.findById(activeId);
      expect(incumbent?.endMonth).toBeNull();
      expect(incumbent?.deletedAt).toBeNull();
      expect(await failing.findById(createdId)).toBeNull();
      expect((await failing.listLiveByTeacher(TEACHER_ID)).length).toBe(1);
    });
  });
});


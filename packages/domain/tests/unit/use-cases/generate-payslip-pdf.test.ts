import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratePayslipPdf, type GeneratePayslipPdfInput } from '../../../src/use-cases/generate-payslip-pdf';
import type { PayslipPdfInput } from '../../../src/ports/payslip-pdf-renderer';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherPayoutNotFoundError } from '../../../src/errors/payroll-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { TeacherPayout, TeacherPayoutId } from '../../../src/entities/teacher-payout';
import type { Center } from '../../../src/entities/center';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryTeacherPayoutRepository } from '../fakes/in-memory-teacher-payout-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;
const PAYOUT_ID = 'pyo_00000000000000000000000001' as TeacherPayoutId;

const envelopeClock = fakeClock('2026-08-01T00:00:00Z');
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock);

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: TEACHER_ID,
    ...envelope(),
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

function makePayout(overrides: Partial<TeacherPayout> = {}): TeacherPayout {
  return {
    id: PAYOUT_ID,
    ...envelope(),
    teacherId: TEACHER_ID,
    month: '2026-08',
    ruleKind: 'percentage-of-monthly-fees',
    amountMad: 30000,
    baseAmountMad: 100000,
    percentSnapshot: 30,
    status: 'draft',
    notes: null,
    ...overrides,
  };
}

const CENTER_PROFILE: Center = {
  id: 'ctr_00000000000000000000000001' as Center['id'],
  ...envelope(),
  name: 'Centre Soutien Casa',
  address: '12 Rue Ibn Sina, Casablanca',
  phone: '+212522000000',
  email: 'contact@centresoutien.ma',
  logoPath: null,
  plan: 'pro',
};

class FakePayslipPdfRenderer {
  lastInput: PayslipPdfInput | null = null;

  async render(input: PayslipPdfInput): Promise<Uint8Array> {
    this.lastInput = input;
    return new Uint8Array([1, 2, 3]);
  }
}

const input = (overrides: Partial<GeneratePayslipPdfInput> = {}) =>
  ({ centerCode: CENTER, teacherPayoutId: PAYOUT_ID, locale: 'fr', ...overrides }) satisfies GeneratePayslipPdfInput;

describe('GeneratePayslipPdf', () => {
  let teachers: InMemoryTeacherRepository;
  let payouts: InMemoryTeacherPayoutRepository;
  let renderer: FakePayslipPdfRenderer;
  let center: Center | null;

  beforeEach(async () => {
    teachers = new InMemoryTeacherRepository();
    payouts = new InMemoryTeacherPayoutRepository();
    renderer = new FakePayslipPdfRenderer();
    center = CENTER_PROFILE;
    await teachers.save(makeTeacher());
    await payouts.save(makePayout());
  });

  function build(plan: Plan): GeneratePayslipPdf {
    return new GeneratePayslipPdf(
      payouts,
      teachers,
      { execute: async () => center },
      { execute: async () => null },
      renderer,
      new PlanPolicy(plan),
    );
  }

  describe('happy path', () => {
    it('renders the PDF from the payout snapshot and the teacher/center profile', async () => {
      const result = await build(PLANS.pro).execute(input());

      expect(result).toEqual({ payoutId: PAYOUT_ID, bytes: new Uint8Array([1, 2, 3]) });
      expect(renderer.lastInput).toMatchObject({
        locale: 'fr',
        payoutId: PAYOUT_ID,
        teacher: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        month: '2026-08',
        status: 'draft',
        ruleKind: 'percentage-of-monthly-fees',
        baseAmountMad: 100000,
        percentSnapshot: 30,
        amountMad: 30000,
        center: { name: 'Centre Soutien Casa' },
      });
    });

    it('renders a fixed-monthly payout with a null snapshot breakdown', async () => {
      await payouts.save(
        makePayout({ ruleKind: 'fixed-monthly', amountMad: 500000, baseAmountMad: null, percentSnapshot: null }),
      );

      await build(PLANS.pro).execute(input());

      expect(renderer.lastInput).toMatchObject({
        ruleKind: 'fixed-monthly',
        baseAmountMad: null,
        percentSnapshot: null,
        amountMad: 500000,
      });
    });

    it('falls back to blank center fields before a profile has ever been saved', async () => {
      center = null;

      await build(PLANS.pro).execute(input());

      expect(renderer.lastInput?.center).toEqual({
        name: '',
        address: '',
        phone: '',
        email: '',
        logoBytes: null,
      });
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute(input())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(renderer.lastInput).toBeNull();
    });
  });

  describe('payout resolution / tenant scoping', () => {
    it('throws TeacherPayoutNotFoundError for an unknown payout id', async () => {
      await expect(
        build(PLANS.pro).execute(input({ teacherPayoutId: 'pyo_00000000000000000000000099' as TeacherPayoutId })),
      ).rejects.toBeInstanceOf(TeacherPayoutNotFoundError);
    });

    it('throws TeacherPayoutNotFoundError for a payout in another center (no cross-tenant read)', async () => {
      const other = 'pyo_00000000000000000000000006' as TeacherPayoutId;
      await payouts.save(makePayout({ id: other, centerCode: OTHER_CENTER }));

      await expect(build(PLANS.pro).execute(input({ teacherPayoutId: other }))).rejects.toBeInstanceOf(
        TeacherPayoutNotFoundError,
      );
    });

    it('throws TeacherPayoutNotFoundError for a soft-deleted payout', async () => {
      await payouts.softDelete(PAYOUT_ID, new Date('2026-08-02T00:00:00Z'), USER);

      await expect(build(PLANS.pro).execute(input())).rejects.toBeInstanceOf(TeacherPayoutNotFoundError);
    });
  });

  describe('teacher resolution / tenant scoping', () => {
    it('still renders when the payout points at an archived teacher (historical payslips stay reprintable)', async () => {
      await teachers.softDelete(TEACHER_ID, new Date('2026-07-30T00:00:00Z'), USER);

      await build(PLANS.pro).execute(input());

      expect(renderer.lastInput).toMatchObject({
        teacher: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
      });
    });

    it('throws TeacherNotFoundError when the payout points at an unknown teacher (neither live nor archived)', async () => {
      await payouts.save(makePayout({ teacherId: 'tch_00000000000000000000000099' as TeacherId }));

      await expect(build(PLANS.pro).execute(input())).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherNotFoundError when the payout points at a teacher in another center', async () => {
      await teachers.save(
        makeTeacher({ id: TEACHER_ID, centerCode: OTHER_CENTER, naturalKey: 'nk-x' }),
      );

      await expect(build(PLANS.pro).execute(input())).rejects.toBeInstanceOf(TeacherNotFoundError);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { GetDashboardAdvancedSummary } from '../../../src/use-cases/get-dashboard-advanced-summary';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { FormulaId } from '../../../src/entities/formula';
import type { StudentSubscription, StudentSubscriptionId } from '../../../src/entities/student-subscription';
import type { StudentId } from '../../../src/entities/student';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { GroupKind } from '../../../src/entities/group';
import type { Holiday, HolidayId } from '../../../src/entities/holiday';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryAttendanceRepository } from '../fakes/in-memory-attendance-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CURRENT_MONTH_ISO = '2026-08-15T09:00:00Z';
const CURRENT_MONTH = '2026-08';

const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;

const clock = () => fakeClock(CURRENT_MONTH_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

let invoiceSeq = 0;
async function seedInvoice(
  invoices: InMemoryInvoiceRepository,
  month: string,
  status: InvoiceStatus,
  netPaidMad: number,
): Promise<void> {
  invoiceSeq += 1;
  const invoice: Invoice = {
    id: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    ...envelope(),
    studentId: `stu_${String(invoiceSeq).padStart(26, '0')}` as StudentId,
    month,
    status,
    issuedAt: status === 'draft' ? null : clock().now(),
    cancelledAt: status === 'cancelled' ? clock().now() : null,
  };
  const line: InvoiceLine = {
    id: `invl_${String(invoiceSeq).padStart(26, '0')}` as InvoiceLineId,
    ...envelope(),
    invoiceId: invoice.id,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad: 20000,
  };
  await invoices.createDraft(invoice, [line]);
  invoices.setNetPaid(invoice.id, netPaidMad);
}

let subscriptionSeq = 0;
async function seedSubscription(
  subscriptions: InMemoryStudentSubscriptionRepository,
  studentId: StudentId,
  startMonth: string,
  endMonth: string | null,
  kind: GroupKind = 'regular',
): Promise<void> {
  subscriptionSeq += 1;
  const subscription: StudentSubscription = {
    id: `sbs_${String(subscriptionSeq).padStart(26, '0')}` as StudentSubscriptionId,
    ...envelope(),
    studentId,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    kind,
    subjectIds: [MATH],
    startMonth,
    endMonth,
  };
  await subscriptions.save(subscription);
}

let holidaySeq = 0;
async function seedHoliday(
  holidays: InMemoryHolidayRepository,
  startDate: string,
  endDate: string,
): Promise<void> {
  holidaySeq += 1;
  const holiday: Holiday = {
    id: `hol_${String(holidaySeq).padStart(26, '0')}` as HolidayId,
    ...envelope(),
    name: { fr: 'Congé', ar: 'عطلة' },
    kind: 'lunar',
    startDate,
    endDate,
    affectsInvoicing: false,
  };
  await holidays.save(holiday);
}

function makeSubject(id: SubjectId, name: { fr: string; ar: string }): Subject {
  return { id, ...envelope(), name, code: null, active: true };
}

describe('GetDashboardAdvancedSummary', () => {
  let invoices: InMemoryInvoiceRepository;
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let attendance: InMemoryAttendanceRepository;
  let subjects: InMemorySubjectRepository;
  let holidays: InMemoryHolidayRepository;
  let attributedBySubject: ReadonlyMap<SubjectId, number>;

  function build(plan: Plan = PLANS.premium): GetDashboardAdvancedSummary {
    return new GetDashboardAdvancedSummary(
      invoices,
      subscriptions,
      attendance,
      subjects,
      holidays,
      { attributedAmountsBySubject: async () => attributedBySubject },
      clock(),
      new PlanPolicy(plan),
    );
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
    subscriptions = new InMemoryStudentSubscriptionRepository();
    attendance = new InMemoryAttendanceRepository();
    subjects = new InMemorySubjectRepository();
    holidays = new InMemoryHolidayRepository();
    attributedBySubject = new Map();
    invoiceSeq = 0;
    subscriptionSeq = 0;
    holidaySeq = 0;
  });

  describe('revenueTrend', () => {
    it('covers the 6 trailing months ending at the current month, oldest first', async () => {
      const result = await build().execute({ centerCode: CENTER });

      expect(result.revenueTrend.map((p) => p.month)).toEqual([
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
    });

    it('sums collected (net paid) money for issued invoices of each month', async () => {
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 20000);
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 15000);

      const result = await build().execute({ centerCode: CENTER });

      const august = result.revenueTrend.find((p) => p.month === CURRENT_MONTH);
      expect(august?.collectedMad).toBe(35000);
    });

    it('excludes draft and cancelled invoices from collected revenue', async () => {
      await seedInvoice(invoices, CURRENT_MONTH, 'draft', 20000);
      await seedInvoice(invoices, CURRENT_MONTH, 'cancelled', 20000);

      const result = await build().execute({ centerCode: CENTER });

      const august = result.revenueTrend.find((p) => p.month === CURRENT_MONTH);
      expect(august?.collectedMad).toBe(0);
    });
  });

  describe('enrollmentEvolution', () => {
    it('counts distinct students with a live subscription active in that month', async () => {
      const studentA = 'stu_00000000000000000000000001' as StudentId;
      const studentB = 'stu_00000000000000000000000002' as StudentId;
      await seedSubscription(subscriptions, studentA, '2026-01', null); // still open
      await seedSubscription(subscriptions, studentB, '2026-06', '2026-07'); // closed before August

      const result = await build().execute({ centerCode: CENTER });

      const june = result.enrollmentEvolution.find((p) => p.month === '2026-06');
      const august = result.enrollmentEvolution.find((p) => p.month === CURRENT_MONTH);
      expect(june?.activeStudentCount).toBe(2);
      expect(august?.activeStudentCount).toBe(1);
    });

    it('counts a student with two subscriptions once, not twice', async () => {
      const student = 'stu_00000000000000000000000001' as StudentId;
      await seedSubscription(subscriptions, student, '2026-01', null);
      await seedSubscription(subscriptions, student, '2026-01', null);

      const result = await build().execute({ centerCode: CENTER });

      const august = result.enrollmentEvolution.find((p) => p.month === CURRENT_MONTH);
      expect(august?.activeStudentCount).toBe(1);
    });
  });

  describe('attendanceRatePercent', () => {
    it('is the present share of every roll-call outcome this month, rounded', async () => {
      attendance.setCenterSummary({ present: 3, absent: 1, excused: 0, late: 0 });

      const result = await build().execute({ centerCode: CENTER });

      expect(result.attendanceRatePercent).toBe(75); // 3 / 4
    });

    it('is 0 when the center has recorded no attendance yet this month', async () => {
      const result = await build().execute({ centerCode: CENTER });

      expect(result.attendanceRatePercent).toBe(0);
    });
  });

  describe('subjectRevenueBreakdown', () => {
    it('resolves each subject id to its bilingual name, highest revenue first', async () => {
      await subjects.save(makeSubject(MATH, { fr: 'Mathématiques', ar: 'رياضيات' }));
      await subjects.save(makeSubject(PHYSICS, { fr: 'Physique', ar: 'فيزياء' }));
      attributedBySubject = new Map([
        [MATH, 10000],
        [PHYSICS, 25000],
      ]);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.subjectRevenueBreakdown).toEqual([
        { subjectId: PHYSICS, subjectName: { fr: 'Physique', ar: 'فيزياء' }, amountMad: 25000 },
        { subjectId: MATH, subjectName: { fr: 'Mathématiques', ar: 'رياضيات' }, amountMad: 10000 },
      ]);
    });

    it('omits a subject id that no longer resolves to a live subject', async () => {
      attributedBySubject = new Map([[MATH, 10000]]); // MATH never seeded

      const result = await build().execute({ centerCode: CENTER });

      expect(result.subjectRevenueBreakdown).toEqual([]);
    });
  });

  describe('enrollmentActivity (net churn)', () => {
    const STUDENT = 'stu_00000000000000000000000001' as StudentId;
    const OTHER = 'stu_00000000000000000000000002' as StudentId;

    it('covers the same 6-month window as the trends, oldest first', async () => {
      const result = await build().execute({ centerCode: CENTER });

      expect(result.enrollmentActivity.map((p) => p.month)).toEqual([
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
    });

    it('counts opens by startMonth and closes by endMonth per month', async () => {
      await seedSubscription(subscriptions, STUDENT, '2026-04', '2026-06');
      await seedSubscription(subscriptions, OTHER, '2026-04', null);

      const result = await build().execute({ centerCode: CENTER });

      const april = result.enrollmentActivity.find((p) => p.month === '2026-04');
      const june = result.enrollmentActivity.find((p) => p.month === '2026-06');
      expect(april).toEqual({ month: '2026-04', opened: 2, closed: 0 });
      expect(june).toEqual({ month: '2026-06', opened: 0, closed: 1 });
    });

    it('excludes a formula-swap close (same student, same kind, reopened the next month)', async () => {
      await seedSubscription(subscriptions, STUDENT, '2026-01', '2026-05');
      await seedSubscription(subscriptions, STUDENT, '2026-06', null);

      const result = await build().execute({ centerCode: CENTER });

      const may = result.enrollmentActivity.find((p) => p.month === '2026-05');
      expect(may).toEqual({ month: '2026-05', opened: 0, closed: 0 });
    });

    it('counts a real cancellation (no same-kind reopen the next month) as a close', async () => {
      await seedSubscription(subscriptions, STUDENT, '2026-01', '2026-05');

      const result = await build().execute({ centerCode: CENTER });

      const may = result.enrollmentActivity.find((p) => p.month === '2026-05');
      expect(may?.closed).toBe(1);
    });

    it('does not treat a reopen two months later as a swap — that close is real churn', async () => {
      await seedSubscription(subscriptions, STUDENT, '2026-01', '2026-05');
      await seedSubscription(subscriptions, STUDENT, '2026-07', null);

      const result = await build().execute({ centerCode: CENTER });

      const may = result.enrollmentActivity.find((p) => p.month === '2026-05');
      expect(may?.closed).toBe(1);
    });

    it('does not treat a next-month reopen of a different kind as a swap', async () => {
      await seedSubscription(subscriptions, STUDENT, '2026-01', '2026-05', 'regular');
      await seedSubscription(subscriptions, STUDENT, '2026-06', null, 'exam-prep' as GroupKind);

      const result = await build().execute({ centerCode: CENTER });

      const may = result.enrollmentActivity.find((p) => p.month === '2026-05');
      expect(may?.closed).toBe(1);
    });
  });

  describe('attendanceHeatmap', () => {
    it('spans the first day of the oldest trend month through today (no future days)', async () => {
      const result = await build().execute({ centerCode: CENTER });

      expect(result.attendanceHeatmap[0]?.date).toBe('2026-03-01');
      expect(result.attendanceHeatmap.at(-1)?.date).toBe('2026-08-15');
    });

    it('computes present / total rounded, with the per-status breakdown for the tooltip', async () => {
      attendance.setDailyCounts([
        { date: '2026-08-10', counts: { present: 3, absent: 1 } },
      ]);

      const result = await build().execute({ centerCode: CENTER });

      const day = result.attendanceHeatmap.find((c) => c.date === '2026-08-10');
      expect(day).toEqual({
        date: '2026-08-10',
        ratePercent: 75,
        isHoliday: false,
        breakdown: { present: 3, absent: 1, excused: 0, late: 0 },
      });
    });

    it('does not count late as present', async () => {
      attendance.setDailyCounts([
        { date: '2026-08-10', counts: { present: 1, late: 3 } },
      ]);

      const result = await build().execute({ centerCode: CENTER });

      const day = result.attendanceHeatmap.find((c) => c.date === '2026-08-10');
      expect(day?.ratePercent).toBe(25); // 1 present / 4 total, late excluded from numerator
    });

    it('greys out a holiday as null + isHoliday even when records exist', async () => {
      await seedHoliday(holidays, '2026-08-10', '2026-08-10');
      attendance.setDailyCounts([
        { date: '2026-08-10', counts: { present: 5 } },
      ]);

      const result = await build().execute({ centerCode: CENTER });

      const day = result.attendanceHeatmap.find((c) => c.date === '2026-08-10');
      expect(day).toEqual({
        date: '2026-08-10',
        ratePercent: null,
        isHoliday: true,
        breakdown: { present: 0, absent: 0, excused: 0, late: 0 },
      });
    });

    it('leaves a non-holiday day with zero records as null (not 0%)', async () => {
      const result = await build().execute({ centerCode: CENTER });

      const day = result.attendanceHeatmap.find((c) => c.date === '2026-08-10');
      expect(day).toEqual({
        date: '2026-08-10',
        ratePercent: null,
        isHoliday: false,
        breakdown: { present: 0, absent: 0, excused: 0, late: 0 },
      });
    });
  });

  it('throws PlanFeatureUnavailableError when the plan lacks dashboard.advanced', async () => {
    const planWithout: Plan = { id: 'premium', features: new Set<FeatureFlag>(), limits: PLANS.premium.limits };

    await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});

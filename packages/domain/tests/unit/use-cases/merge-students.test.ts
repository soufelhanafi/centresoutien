import { describe, it, expect, beforeEach } from 'vitest';
import { MergeStudents, type MergeStudentsInput } from '../../../src/use-cases/merge-students';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
import { MergeSameEntityError } from '../../../src/errors/merge-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Student, StudentId } from '../../../src/entities/student';
import type { ParentId } from '../../../src/entities/parent';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { GroupId } from '../../../src/entities/group';
import type { StudentSubscription, StudentSubscriptionId } from '../../../src/entities/student-subscription';
import type { FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { AttendanceRecord, AttendanceRecordId } from '../../../src/entities/attendance-record';
import type { SessionId } from '../../../src/entities/session';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryAttendanceRepository } from '../fakes/in-memory-attendance-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { InMemoryMergeLogRepository } from '../fakes/in-memory-merge-log-repository';
import { InMemoryMergeStudentsUnitOfWork } from '../fakes/in-memory-merge-students-unit-of-work';
import { isSubscriptionActiveInMonth } from '../../../src/policies/student-subscription-policy';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const WINNER = 'stu_0000000000000000000000000A' as StudentId;
const LOSER = 'stu_0000000000000000000000000B' as StudentId;
const GROUP = 'grp_0000000000000000000000000C' as GroupId;
const FORMULA = 'frm_0000000000000000000000000D' as FormulaId;
const SUBJECT = 'sub_0000000000000000000000000E' as SubjectId;
const SESSION = 'ses_0000000000000000000000000F' as SessionId;
const GUARDIAN = 'prt_0000000000000000000000000G' as ParentId;

const clock = fakeClock('2026-07-28T10:00:00Z');

function makeStudent(id: StudentId, overrides: Partial<Student> = {}): Student {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    naturalKey: `${CENTER}::yassine-alaoui::2009-05-01`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2009-05-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [GUARDIAN],
    ...overrides,
  };
}

function makeEnrollment(id: EnrollmentId, studentId: StudentId): Enrollment {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId,
    groupId: GROUP,
    startMonth: '2026-09',
    endMonth: null,
  };
}

function makeSubscription(
  id: StudentSubscriptionId,
  studentId: StudentId,
  overrides: Partial<StudentSubscription> = {},
): StudentSubscription {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId,
    formulaId: FORMULA,
    kind: 'regular',
    subjectIds: [SUBJECT],
    startMonth: '2026-09',
    endMonth: null,
    ...overrides,
  };
}

function makeAttendance(id: AttendanceRecordId, studentId: StudentId): AttendanceRecord {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    sessionId: SESSION,
    studentId,
    status: 'present',
    note: null,
  };
}

function makeInvoice(id: InvoiceId, studentId: StudentId): Invoice {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId,
    month: '2026-07',
    status: 'issued',
    issuedAt: new Date('2026-07-01T00:00:00Z'),
    cancelledAt: null,
  };
}

function makePayment(id: PaymentId, invoiceId: InvoiceId): Payment {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    invoiceId,
    kind: 'payment',
    amountMad: 35000,
    method: 'cash',
    paidOn: '2026-07-05',
    reversesPaymentId: null,
    note: null,
  };
}

function activeCountInMonth(
  subs: readonly StudentSubscription[],
  month: string,
): number {
  return subs.filter((s) => isSubscriptionActiveInMonth(s, month)).length;
}

function validInput(overrides: Partial<MergeStudentsInput> = {}): MergeStudentsInput {
  return {
    winnerId: WINNER,
    loserId: LOSER,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('MergeStudents', () => {
  let students: InMemoryStudentRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let attendance: InMemoryAttendanceRepository;
  let invoices: InMemoryInvoiceRepository;
  let payments: InMemoryPaymentRepository;
  let mergeLogs: InMemoryMergeLogRepository;
  let unitOfWork: InMemoryMergeStudentsUnitOfWork;
  let useCase: MergeStudents;

  function setup(failAfterWrites = false): void {
    students = new InMemoryStudentRepository();
    enrollments = new InMemoryEnrollmentRepository();
    subscriptions = new InMemoryStudentSubscriptionRepository();
    attendance = new InMemoryAttendanceRepository();
    invoices = new InMemoryInvoiceRepository();
    payments = new InMemoryPaymentRepository();
    mergeLogs = new InMemoryMergeLogRepository();
    unitOfWork = new InMemoryMergeStudentsUnitOfWork(
      students,
      enrollments,
      subscriptions,
      attendance,
      invoices,
      mergeLogs,
      failAfterWrites,
    );
    useCase = new MergeStudents(students, clock, fakeIds(), new PlanPolicy(PLANS.premium), unitOfWork);
  }

  beforeEach(() => {
    setup();
  });

  describe('happy path', () => {
    it('re-points every dependent in one transaction, tombstones the loser, records the log', async () => {
      await students.save(makeStudent(WINNER, { school: 'Lycee Ibn Sina' }));
      await students.save(makeStudent(LOSER, { notes: 'attention au deplacement' }));
      const enrollment = makeEnrollment('enr_00000000000000000000000001' as EnrollmentId, LOSER);
      const subscription = makeSubscription('sbs_00000000000000000000000002' as StudentSubscriptionId, LOSER);
      const attendanceRow = makeAttendance('att_00000000000000000000000003' as AttendanceRecordId, LOSER);
      const invoice = makeInvoice('inv_00000000000000000000000004' as InvoiceId, LOSER);
      const invoiceOfWinner = makeInvoice('inv_00000000000000000000000005' as InvoiceId, WINNER);
      await enrollments.save(enrollment);
      await subscriptions.save(subscription);
      await attendance.save(attendanceRow);
      await invoices.save(invoice);
      await invoices.save(invoiceOfWinner);

      const result = await useCase.execute(validInput());

      expect(result.id).toBe(WINNER);
      expect(result.deletedAt).toBeNull();
      // Winner absorbs the loser's missing fields; its own values win.
      expect(result.school).toBe('Lycee Ibn Sina');
      expect(result.notes).toBe('attention au deplacement');

      const tombstoned = students.all().find((s) => s.id === LOSER);
      expect(tombstoned?.deletedAt).toEqual(new Date('2026-07-28T10:00:00Z'));
      expect(tombstoned?.mergedIntoId).toBe(WINNER);

      expect(enrollments.all().find((e) => e.id === enrollment.id)?.studentId).toBe(WINNER);
      expect(subscriptions.all().find((s) => s.id === subscription.id)?.studentId).toBe(WINNER);
      expect(attendance.all().find((a) => a.id === attendanceRow.id)?.studentId).toBe(WINNER);
      expect(invoices.all().find((i) => i.id === invoice.id)?.studentId).toBe(WINNER);
      // Rows already on the winner are left alone.
      expect(invoices.all().find((i) => i.id === invoiceOfWinner.id)?.studentId).toBe(WINNER);

      const logs = mergeLogs.all();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        entityType: 'students',
        loserId: LOSER,
        winnerId: WINNER,
        reason: 'manual',
      });
      expect(logs[0]?.deletedAt).toBeNull();
    });

    it('calls the unit of work exactly once — one atomic commit, not N independent repo awaits', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      await enrollments.save(makeEnrollment('enr_00000000000000000000000001' as EnrollmentId, LOSER));
      await useCase.execute(validInput());
      expect(unitOfWork.commits).toBe(1);
    });

    it('records the duplicate-detection reason when the sync engine drives the merge', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      await useCase.execute(validInput({ reason: 'separated-family' }));
      expect(mergeLogs.all()[0]?.reason).toBe('separated-family');
    });
  });

  describe('subscription reconciliation (M3)', () => {
    it('closes the loser-origin active subscription when it duplicates a live winner subscription of the same kind', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const winnerSub = makeSubscription('sbs_00000000000000000000000006' as StudentSubscriptionId, WINNER, {
        startMonth: '2026-06',
      });
      const loserSub = makeSubscription('sbs_00000000000000000000000007' as StudentSubscriptionId, LOSER, {
        startMonth: '2026-06',
      });
      await subscriptions.save(winnerSub);
      await subscriptions.save(loserSub);

      await useCase.execute(validInput());

      // Exactly ONE open regular subscription survives on the winner — the
      // invariant is never violated by a merge (double-billing guard).
      const winnerSubs = subscriptions.all().filter((s) => s.studentId === WINNER);
      const open = winnerSubs.filter((s) => s.endMonth === null);
      expect(open).toHaveLength(1);
      expect(open[0]?.id).toBe(winnerSub.id);

      // The loser-origin one is capped at the month BEFORE the merge month
      // (2026-06) — endMonth is inclusive, so closing at 2026-07 would still
      // bill the merge month and double-bill the winner. It stays a closed row
      // pointing at the winner for history and is recorded in the log note.
      const closedLoserOrigin = winnerSubs.find((s) => s.id === loserSub.id);
      expect(closedLoserOrigin?.studentId).toBe(WINNER);
      expect(closedLoserOrigin?.endMonth).toBe('2026-06');
      expect(mergeLogs.all()[0]?.note).toContain(loserSub.id);
      // The merge month bills exactly ONE sub on the winner — never two.
      expect(activeCountInMonth(winnerSubs, '2026-07')).toBe(1);
    });

    it('keeps both active subscriptions when the kinds do not overlap (winner regular, loser exam-prep)', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const winnerSub = makeSubscription('sbs_00000000000000000000000006' as StudentSubscriptionId, WINNER, {
        kind: 'regular',
        startMonth: '2026-06',
      });
      const loserSub = makeSubscription('sbs_00000000000000000000000007' as StudentSubscriptionId, LOSER, {
        kind: 'exam-prep',
        startMonth: '2026-06',
      });
      await subscriptions.save(winnerSub);
      await subscriptions.save(loserSub);

      await useCase.execute(validInput());

      const winnerSubs = subscriptions.all().filter((s) => s.studentId === WINNER);
      const open = winnerSubs.filter((s) => s.endMonth === null);
      expect(open).toHaveLength(2);
      expect(open.map((s) => s.id)).toEqual(expect.arrayContaining([winnerSub.id, loserSub.id]));
      expect(mergeLogs.all()[0]?.note).toBeNull();
    });

    it('a loser-origin subscription that is already closed is never touched by reconciliation', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const winnerSub = makeSubscription('sbs_00000000000000000000000006' as StudentSubscriptionId, WINNER, {
        startMonth: '2026-06',
      });
      const closedLoserSub = makeSubscription('sbs_00000000000000000000000007' as StudentSubscriptionId, LOSER, {
        startMonth: '2025-09',
        endMonth: '2026-05',
      });
      await subscriptions.save(winnerSub);
      await subscriptions.save(closedLoserSub);

      await useCase.execute(validInput());

      const winnerSubs = subscriptions.all().filter((s) => s.studentId === WINNER);
      const preserved = winnerSubs.find((s) => s.id === closedLoserSub.id);
      expect(preserved?.endMonth).toBe('2026-05');
      expect(mergeLogs.all()[0]?.note).toBeNull();
    });

    it('a loser-origin subscription starting in the merge month is cancelled entirely — it must never bill a month the winner covers', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const winnerSub = makeSubscription('sbs_00000000000000000000000006' as StudentSubscriptionId, WINNER, {
        startMonth: '2026-06',
      });
      const loserSub = makeSubscription('sbs_00000000000000000000000007' as StudentSubscriptionId, LOSER, {
        startMonth: '2026-07',
      });
      await subscriptions.save(winnerSub);
      await subscriptions.save(loserSub);

      await useCase.execute(validInput());

      const winnerSubs = subscriptions.all().filter((s) => s.studentId === WINNER);
      // endMonth (2026-06) lands BEFORE startMonth (2026-07) — the derived-status
      // rule reads this as active for zero months: a full cancellation for the
      // merge month, the same convention CloseStudentSubscription permits.
      const cancelled = winnerSubs.find((s) => s.id === loserSub.id);
      expect(cancelled?.studentId).toBe(WINNER);
      expect(cancelled?.endMonth).toBe('2026-06');
      expect(isSubscriptionActiveInMonth(cancelled!, '2026-07')).toBe(false);
      // Exactly ONE billable sub for the merge month — the winner's open one.
      expect(activeCountInMonth(winnerSubs, '2026-07')).toBe(1);
      expect(mergeLogs.all()[0]?.note).toContain(loserSub.id);
    });

    it('keeps the actively-billing loser-origin sub until the future-starting winner sub takes over — no gap, no overlap', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const winnerSub = makeSubscription('sbs_00000000000000000000000006' as StudentSubscriptionId, WINNER, {
        startMonth: '2026-09',
      });
      const loserSub = makeSubscription('sbs_00000000000000000000000007' as StudentSubscriptionId, LOSER, {
        startMonth: '2026-03',
      });
      await subscriptions.save(winnerSub);
      await subscriptions.save(loserSub);

      await useCase.execute(validInput());

      const winnerSubs = subscriptions.all().filter((s) => s.studentId === WINNER);
      const winnerAfter = winnerSubs.find((s) => s.id === winnerSub.id);
      const loserAfter = winnerSubs.find((s) => s.id === loserSub.id);
      // The future-starting (pre-enrolled) winner sub is kept open; the loser
      // sub that is billing NOW is capped at the month before the winner starts,
      // so coverage hands over without a billing gap and without overlap.
      expect(winnerAfter?.endMonth).toBeNull();
      expect(loserAfter?.endMonth).toBe('2026-08');

      // Exactly one billable sub in every month from the merge month through the
      // winner's first term — the loser covers 07 + 08, the winner 09 onward.
      expect(activeCountInMonth(winnerSubs, '2026-07')).toBe(1);
      expect(activeCountInMonth(winnerSubs, '2026-08')).toBe(1);
      expect(activeCountInMonth(winnerSubs, '2026-09')).toBe(1);
      expect(activeCountInMonth(winnerSubs, '2026-10')).toBe(1);
      expect(isSubscriptionActiveInMonth(loserAfter!, '2026-08')).toBe(true);
      expect(isSubscriptionActiveInMonth(loserAfter!, '2026-09')).toBe(false);
      expect(isSubscriptionActiveInMonth(winnerAfter!, '2026-08')).toBe(false);
      expect(isSubscriptionActiveInMonth(winnerAfter!, '2026-09')).toBe(true);
      expect(mergeLogs.all()[0]?.note).toContain(loserSub.id);
    });
  });

  describe('detached guardian links (M4)', () => {
    it('keeps the conservative winner-only guardian list and records the loser’s extra guardians in the note', async () => {
      const EXTRA_GUARDIAN = 'prt_0000000000000000000000000H' as ParentId;
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER, { guardianIds: [GUARDIAN, EXTRA_GUARDIAN] }));

      await useCase.execute(validInput());

      const savedWinner = students.all().find((s) => s.id === WINNER);
      // Winner-only list is untouched — never unioned (separated-family safety).
      expect(savedWinner?.guardianIds).toEqual([GUARDIAN]);
      expect(mergeLogs.all()[0]?.note).toContain(EXTRA_GUARDIAN);
      // The shared guardian is not reported as detached.
      expect(mergeLogs.all()[0]?.note).not.toContain(GUARDIAN);
    });
  });

  describe('payments are never merged or re-pointed', () => {
    it('the merge unit carries exactly the four dependent kinds — payments have no seat', async () => {
      await students.save(makeStudent(WINNER));
      await students.save(makeStudent(LOSER));
      const invoice = makeInvoice('inv_00000000000000000000000004' as InvoiceId, LOSER);
      await invoices.save(invoice);
      await payments.append(makePayment('pay_00000000000000000000000005' as PaymentId, invoice.id));

      await useCase.execute(validInput());

      expect(Object.keys(unitOfWork.lastUnit?.repointed ?? {})).toEqual(
        expect.arrayContaining(['enrollments', 'subscriptions', 'attendance', 'invoices']),
      );
      expect(Object.keys(unitOfWork.lastUnit?.repointed ?? {})).not.toContain('payments');
      // The append-only ledger is untouched by a student merge (it references invoiceId).
      expect(payments.all()).toHaveLength(1);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks sync.conflict-resolution', async () => {
      useCase = new MergeStudents(
        students,
        clock,
        fakeIds(),
        new PlanPolicy(planWithoutFeature('sync.conflict-resolution')),
        unitOfWork,
      );
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('guards', () => {
    it('rejects a self-merge (winnerId === loserId)', async () => {
      await expect(useCase.execute(validInput({ loserId: WINNER }))).rejects.toBeInstanceOf(
        MergeSameEntityError,
      );
    });

    it('rejects an unknown or archived winner', async () => {
      await students.save(makeStudent(LOSER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(StudentNotFoundError);

      await students.save(makeStudent(WINNER, { deletedAt: new Date('2026-07-01T00:00:00Z') }));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(StudentNotFoundError);
    });

    it('rejects an unknown or archived loser', async () => {
      await students.save(makeStudent(WINNER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(StudentNotFoundError);

      await students.save(makeStudent(LOSER, { deletedAt: new Date('2026-07-01T00:00:00Z') }));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(StudentNotFoundError);
    });

    it('rejects a cross-center merge — a foreign-tenant id reads as not found', async () => {
      await students.save(makeStudent(WINNER, { centerCode: OTHER_CENTER }));
      await students.save(makeStudent(LOSER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(StudentNotFoundError);
    });
  });

  describe('atomicity (SOU-169)', () => {
    it('rolls back the whole merge when a dependent re-point write fails', async () => {
      setup(true);
      const winnerBefore = makeStudent(WINNER);
      const loserBefore = makeStudent(LOSER);
      const enrollmentBefore = makeEnrollment('enr_00000000000000000000000001' as EnrollmentId, LOSER);
      const invoiceBefore = makeInvoice('inv_00000000000000000000000004' as InvoiceId, LOSER);
      await students.save(winnerBefore);
      await students.save(loserBefore);
      await enrollments.save(enrollmentBefore);
      await invoices.save(invoiceBefore);

      await expect(useCase.execute(validInput())).rejects.toThrow('simulated dependent re-point failure');

      // Nothing applied: winner/loser untouched, dependent still on loser, no log.
      expect(students.all().find((s) => s.id === WINNER)).toEqual(winnerBefore);
      expect(students.all().find((s) => s.id === LOSER)).toEqual(loserBefore);
      expect(students.all().find((s) => s.id === LOSER)?.deletedAt).toBeNull();
      expect(enrollments.all().find((e) => e.id === enrollmentBefore.id)).toEqual(enrollmentBefore);
      expect(enrollments.all().find((e) => e.id === enrollmentBefore.id)?.studentId).toBe(LOSER);
      expect(invoices.all().find((i) => i.id === invoiceBefore.id)).toEqual(invoiceBefore);
      expect(mergeLogs.all()).toHaveLength(0);
      expect(unitOfWork.commits).toBe(1);
    });
  });
});

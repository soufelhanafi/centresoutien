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

function makeSubscription(id: StudentSubscriptionId, studentId: StudentId): StudentSubscription {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId,
    formulaId: FORMULA,
    kind: 'regular',
    subjectIds: [SUBJECT],
    startMonth: '2026-09',
    endMonth: null,
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

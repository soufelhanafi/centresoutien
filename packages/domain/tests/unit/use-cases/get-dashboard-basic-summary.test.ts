import { describe, it, expect, beforeEach } from 'vitest';
import { GetDashboardBasicSummary } from '../../../src/use-cases/get-dashboard-basic-summary';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Session, SessionId } from '../../../src/entities/session';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { StudentSubscription, StudentSubscriptionId } from '../../../src/entities/student-subscription';
import type { Group, GroupId, GroupKind } from '../../../src/entities/group';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { SubjectId } from '../../../src/entities/subject';
import type { RoomId } from '../../../src/entities/room';
import type { FormulaId } from '../../../src/entities/formula';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fromMinutes } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { toEntityId } from '../../../src/value-objects/ids';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CLOCK_ISO = '2026-08-15T09:00:00Z'; // Saturday — week runs Mon 2026-08-10 .. Sun 2026-08-16
const CURRENT_MONTH = '2026-08';
const PREV_MONTH = '2026-07';
const WEEK_START = '2026-08-10';
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const FORMULA = 'fml_00000000000000000000000009' as FormulaId;

const clock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${String(++seq).padStart(26, '0')}`;

function makeStudent(): Student {
  return {
    id: nextId('stu') as StudentId,
    ...envelope(),
    naturalKey: `${CENTER}::student-${seq}::2010-01-01`,
    name: { fr: `Élève ${seq}`, ar: `تلميذ ${seq}` },
    birthDate: '2010-01-01',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
  };
}

function makeGroup(kind: GroupKind, level: string, capacity: number): Group {
  return {
    id: nextId('grp') as GroupId,
    ...envelope(),
    subjectId: SUBJECT,
    teacherId: null,
    level,
    capacity,
    kind,
    active: true,
  };
}

function makeTeacher(name: string): Teacher {
  return {
    id: nextId('tch') as TeacherId,
    ...envelope(),
    naturalKey: `${CENTER}::${name}::+212600000000`,
    name: { fr: name, ar: name },
    cin: null,
    phone: '+212612345678' as PhoneNumber,
    email: null,
    subjectIds: [SUBJECT],
    active: true,
  };
}

function makeSession(date: string, start: TimeOfDay, end: TimeOfDay): Session {
  return {
    id: nextId('ses') as SessionId,
    ...envelope(),
    recurringSessionId: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
    generationBatchId: null,
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    date,
    start,
    end,
  };
}

function makeRecurring(dayOfWeek: WeekdayIndex, start: TimeOfDay, end: TimeOfDay): WeeklyRecurringSession {
  return {
    id: nextId('wrs') as WeeklyRecurringSessionId,
    ...envelope(),
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    dayOfWeek,
    start,
    end,
    active: true,
    validFrom: null,
    validTo: null,
  };
}

async function seedInvoice(
  invoices: InMemoryInvoiceRepository,
  month: string,
  status: InvoiceStatus,
  amountMad: number,
  netPaidMad: number,
): Promise<void> {
  const id = nextId('inv') as InvoiceId;
  const invoice: Invoice = {
    id,
    ...envelope(),
    studentId: nextId('stu') as StudentId,
    month,
    status,
    issuedAt: status === 'draft' ? null : clock().now(),
    cancelledAt: status === 'cancelled' ? clock().now() : null,
  };
  const line: InvoiceLine = {
    id: nextId('invl') as InvoiceLineId,
    ...envelope(),
    invoiceId: id,
    formulaId: FORMULA,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
  await invoices.createDraft(invoice, [line]);
  invoices.setNetPaid(id, netPaidMad);
}

async function seedSubscription(
  subscriptions: InMemoryStudentSubscriptionRepository,
  studentId: StudentId,
  startMonth: string,
  endMonth: string | null,
  kind: GroupKind = 'regular',
): Promise<void> {
  const subscription: StudentSubscription = {
    id: nextId('sbs') as StudentSubscriptionId,
    ...envelope(),
    studentId,
    formulaId: FORMULA,
    kind,
    subjectIds: [SUBJECT],
    startMonth,
    endMonth,
  };
  await subscriptions.save(subscription);
}

async function seedEnrollment(
  enrollments: InMemoryEnrollmentRepository,
  studentId: StudentId,
  groupId: GroupId,
): Promise<void> {
  const enrollment: Enrollment = {
    id: nextId('enr') as EnrollmentId,
    ...envelope(),
    studentId,
    groupId,
    startMonth: '2026-01',
    endMonth: null,
  };
  await enrollments.save(enrollment);
}

describe('GetDashboardBasicSummary', () => {
  let sessions: InMemorySessionRepository;
  let students: InMemoryStudentRepository;
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let invoices: InMemoryInvoiceRepository;
  let groups: InMemoryGroupRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let teachers: InMemoryTeacherRepository;
  let recurring: InMemoryWeeklyRecurringSessionRepository;

  function build(plan: Plan = PLANS.essentiel): GetDashboardBasicSummary {
    return new GetDashboardBasicSummary(
      sessions,
      students,
      subscriptions,
      invoices,
      groups,
      enrollments,
      teachers,
      recurring,
      clock(),
      new PlanPolicy(plan),
    );
  }

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    students = new InMemoryStudentRepository();
    subscriptions = new InMemoryStudentSubscriptionRepository();
    invoices = new InMemoryInvoiceRepository();
    groups = new InMemoryGroupRepository();
    enrollments = new InMemoryEnrollmentRepository();
    teachers = new InMemoryTeacherRepository();
    recurring = new InMemoryWeeklyRecurringSessionRepository();
    seq = 0;
  });

  describe('argent', () => {
    it('reports the full money shape for the current month, recognized to billed month', async () => {
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 20000, 20000); // paid
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 15000, 5000); // partial
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 10000, 0); // unpaid
      await seedInvoice(invoices, CURRENT_MONTH, 'draft', 5000, 0); // excluded
      await seedInvoice(invoices, CURRENT_MONTH, 'cancelled', 3000, 0); // excluded
      await seedInvoice(invoices, PREV_MONTH, 'issued', 30000, 30000); // prev baseline
      await seedInvoice(invoices, PREV_MONTH, 'issued', 10000, 0);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.argent.month).toBe(CURRENT_MONTH);
      expect(result.argent.billedMad).toBe(45000);
      expect(result.argent.collectedMad).toBe(25000);
      expect(result.argent.unpaidMad).toBe(20000);
      expect(result.argent.paidInvoices).toEqual({ paidCount: 1, totalCount: 3 });
      expect(result.argent.prevMonth).toEqual({ billedMad: 40000, collectedMad: 30000, unpaidMad: 10000 });
      expect(result.argent.deltas.billed).toEqual({ deltaPercent: 12.5 });
      expect(result.argent.deltas.collected).toEqual({ deltaPercent: -16.7 });
      expect(result.argent.deltas.unpaid).toEqual({ deltaPercent: 100 });
    });

    it('reports null deltaPercent for every money KPI when the previous month has no issued invoices', async () => {
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 20000, 20000);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.argent.prevMonth).toEqual({ billedMad: 0, collectedMad: 0, unpaidMad: 0 });
      expect(result.argent.deltas.billed).toEqual({ deltaPercent: null });
      expect(result.argent.deltas.collected).toEqual({ deltaPercent: null });
      expect(result.argent.deltas.unpaid).toEqual({ deltaPercent: null });
    });

    it('keeps unpaidMad = billedMad - collectedMad with draft and cancelled invoices excluded', async () => {
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 10000, 4000);
      await seedInvoice(invoices, CURRENT_MONTH, 'issued', 20000, 20000);
      await seedInvoice(invoices, CURRENT_MONTH, 'draft', 9999, 0);
      await seedInvoice(invoices, CURRENT_MONTH, 'cancelled', 9999, 0);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.argent.billedMad).toBe(30000);
      expect(result.argent.collectedMad).toBe(24000);
      expect(result.argent.unpaidMad).toBe(6000);
      expect(result.argent.paidInvoices).toEqual({ paidCount: 1, totalCount: 2 });
    });
  });

  describe('effectifs', () => {
    it('counts live students, groups, enrollments, and unenrolled students', async () => {
      const s1 = makeStudent();
      const s2 = makeStudent();
      const s3 = makeStudent();
      const archived = makeStudent();
      await students.save(s1);
      await students.save(s2);
      await students.save(s3);
      await students.save(archived);
      await students.softDelete(archived.id, clock().now(), USER);

      // s1 active regular, s3 active exam-prep, s2 closed before August.
      await seedSubscription(subscriptions, s1.id, '2026-01', null);
      await seedSubscription(subscriptions, s2.id, '2026-01', '2026-06');
      await seedSubscription(subscriptions, s3.id, '2026-01', null, 'exam-prep');

      const g1 = makeGroup('regular', '3AC', 20);
      const g2 = makeGroup('exam-prep', 'Bac', 15);
      const g3 = makeGroup('regular', 'Tronc commun', 25);
      await groups.save(g1);
      await groups.save(g2);
      await groups.save(g3);
      await seedEnrollment(enrollments, s1.id, g1.id);
      await seedEnrollment(enrollments, s3.id, g1.id);
      await seedEnrollment(enrollments, s3.id, g2.id);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.effectifs.activeStudentCount).toBe(3);
      expect(result.effectifs.groupCount).toBe(3);
      expect(result.effectifs.averageStudentsPerGroup).toBe(1);
      expect(result.effectifs.unenrolledStudentCount).toBe(1);
      expect(result.effectifs.groupBars).toEqual([
        { groupId: g1.id, groupName: { fr: '3AC', ar: '3AC' }, kind: 'regular', enrolledCount: 2, capacity: 20 },
        { groupId: g2.id, groupName: { fr: 'Bac', ar: 'Bac' }, kind: 'exam-prep', enrolledCount: 1, capacity: 15 },
        { groupId: g3.id, groupName: { fr: 'Tronc commun', ar: 'Tronc commun' }, kind: 'regular', enrolledCount: 0, capacity: 25 },
      ]);
    });

    it('reports averageStudentsPerGroup 0 and no group bars when the center has no groups', async () => {
      await students.save(makeStudent());

      const result = await build().execute({ centerCode: CENTER });

      expect(result.effectifs.activeStudentCount).toBe(1);
      expect(result.effectifs.groupCount).toBe(0);
      expect(result.effectifs.averageStudentsPerGroup).toBe(0);
      expect(result.effectifs.groupBars).toEqual([]);
    });

    it('rounds averageStudentsPerGroup to one decimal', async () => {
      for (let i = 0; i < 5; i += 1) await students.save(makeStudent());
      await groups.save(makeGroup('regular', '3AC', 20));
      await groups.save(makeGroup('regular', '2AC', 20));
      await groups.save(makeGroup('regular', '1AC', 20));

      const result = await build().execute({ centerCode: CENTER });

      expect(result.effectifs.averageStudentsPerGroup).toBe(1.7);
    });

    it('counts a student holding two live subscriptions once in unenrolledStudentCount', async () => {
      const s = makeStudent();
      await students.save(s);
      await seedSubscription(subscriptions, s.id, '2026-01', null);
      await seedSubscription(subscriptions, s.id, '2026-01', null, 'exam-prep');

      const result = await build().execute({ centerCode: CENTER });

      expect(result.effectifs.unenrolledStudentCount).toBe(0);
    });
  });

  describe('teacherWeeklyLoad', () => {
    it('sums each teacher\'s session minutes this week and sorts by minutes desc', async () => {
      const t1 = makeTeacher('Yassine');
      const t2 = makeTeacher('Karim');
      const t3 = makeTeacher('Salma');
      await teachers.save(t1);
      await teachers.save(t2);
      await teachers.save(t3);

      const s1 = makeSession('2026-08-10', '09:00' as TimeOfDay, '10:00' as TimeOfDay); // 60
      s1.teacherId = toEntityId(t1.id);
      const s2 = makeSession('2026-08-11', '10:00' as TimeOfDay, '12:00' as TimeOfDay); // 120
      s2.teacherId = toEntityId(t2.id);
      const s3 = makeSession('2026-08-12', '14:00' as TimeOfDay, '15:30' as TimeOfDay); // 90
      s3.teacherId = toEntityId(t3.id);
      const s4 = makeSession('2026-08-13', '16:00' as TimeOfDay, '17:30' as TimeOfDay); // 90
      s4.teacherId = toEntityId(t1.id);
      await sessions.save(s1);
      await sessions.save(s2);
      await sessions.save(s3);
      await sessions.save(s4);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.teacherWeeklyLoad).toEqual([
        { teacherId: t1.id, teacherName: t1.name, weeklyMinutes: 150 },
        { teacherId: t2.id, teacherName: t2.name, weeklyMinutes: 120 },
        { teacherId: t3.id, teacherName: t3.name, weeklyMinutes: 90 },
      ]);
    });

    it('omits teachers with no session this week and caps the list at DASHBOARD_TEACHER_LOAD_TOP_N', async () => {
      const noSession = makeTeacher('Inactive');
      await teachers.save(noSession);

      const leaders: { teacher: Teacher; minutes: number }[] = [];
      for (let i = 1; i <= 10; i += 1) {
        const teacher = makeTeacher(`T${i}`);
        await teachers.save(teacher);
        leaders.push({ teacher, minutes: i * 10 });
      }

      for (const { teacher, minutes } of leaders) {
        const session = makeSession(WEEK_START, '09:00' as TimeOfDay, fromMinutes(540 + minutes));
        session.teacherId = toEntityId(teacher.id);
        await sessions.save(session);
      }

      const result = await build().execute({ centerCode: CENTER });

      const byId = new Map<string, Teacher>(leaders.map(({ teacher }) => [teacher.id, teacher]));
      expect(result.teacherWeeklyLoad).toHaveLength(8);
      expect(result.teacherWeeklyLoad.every((load) => byId.has(load.teacherId))).toBe(true);
      expect(result.teacherWeeklyLoad[0]?.weeklyMinutes).toBe(100);
      expect(result.teacherWeeklyLoad[7]?.weeklyMinutes).toBe(30);
      const ids = result.teacherWeeklyLoad.map((load) => load.teacherId);
      expect(ids).not.toContain(noSession.id);
    });

    it('ignores sessions dated outside the current week', async () => {
      const t1 = makeTeacher('Yassine');
      await teachers.save(t1);
      const inside = makeSession('2026-08-10', '09:00' as TimeOfDay, '10:00' as TimeOfDay);
      inside.teacherId = toEntityId(t1.id);
      const outside = makeSession('2026-08-17', '09:00' as TimeOfDay, '12:00' as TimeOfDay);
      outside.teacherId = toEntityId(t1.id);
      await sessions.save(inside);
      await sessions.save(outside);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.teacherWeeklyLoad).toEqual([
        { teacherId: t1.id, teacherName: t1.name, weeklyMinutes: 60 },
      ]);
    });
  });

  describe('seances', () => {
    it('reports weekStart as the UTC Monday of Clock.now() and counts the week\'s sessions', async () => {
      await sessions.save(makeSession('2026-08-10', '09:00' as TimeOfDay, '10:00' as TimeOfDay));
      await sessions.save(makeSession('2026-08-15', '09:00' as TimeOfDay, '10:00' as TimeOfDay));
      await sessions.save(makeSession('2026-08-17', '09:00' as TimeOfDay, '10:00' as TimeOfDay)); // next week

      const result = await build().execute({ centerCode: CENTER });

      expect(result.seances.weekStart).toBe(WEEK_START);
      expect(result.seances.weekSessionCount).toBe(2);
    });

    it('sums the duration minutes of every live weekly-recurring session as plannedMinutes', async () => {
      await recurring.save(makeRecurring(1, '09:00' as TimeOfDay, '10:00' as TimeOfDay)); // 60
      await recurring.save(makeRecurring(2, '10:00' as TimeOfDay, '12:00' as TimeOfDay)); // 120
      await recurring.save(makeRecurring(4, '18:00' as TimeOfDay, '20:00' as TimeOfDay)); // 120
      await recurring.save(makeRecurring(5, '09:00' as TimeOfDay, '10:30' as TimeOfDay)); // 90
      const cancelled = makeRecurring(6, '09:00' as TimeOfDay, '11:00' as TimeOfDay);
      await recurring.save(cancelled);
      await recurring.softDelete(cancelled.id, clock().now(), USER);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.seances.plannedMinutes).toBe(390);
    });

    it('lists every live group as groupsWithoutSessions when the week has no sessions', async () => {
      const g1 = makeGroup('regular', '3AC', 20);
      const g2 = makeGroup('exam-prep', 'Bac', 15);
      await groups.save(g1);
      await groups.save(g2);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.seances.weekSessionCount).toBe(0);
      expect(result.seances.groupsWithoutSessions).toEqual([
        { groupId: g1.id, groupName: { fr: '3AC', ar: '3AC' }, kind: 'regular' },
        { groupId: g2.id, groupName: { fr: 'Bac', ar: 'Bac' }, kind: 'exam-prep' },
      ]);
    });

    it('excludes a live group from groupsWithoutSessions once it has a session in the week', async () => {
      const g1 = makeGroup('regular', '3AC', 20);
      const g2 = makeGroup('regular', '2AC', 20);
      await groups.save(g1);
      await groups.save(g2);

      const withGroup = makeSession('2026-08-10', '09:00' as TimeOfDay, '10:00' as TimeOfDay);
      withGroup.groupId = g1.id;
      await sessions.save(withGroup);

      const result = await build().execute({ centerCode: CENTER });

      expect(result.seances.groupsWithoutSessions).toEqual([
        { groupId: g2.id, groupName: { fr: '2AC', ar: '2AC' }, kind: 'regular' },
      ]);
    });
  });

  it('throws PlanFeatureUnavailableError when the plan lacks dashboard.basic', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };

    await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});

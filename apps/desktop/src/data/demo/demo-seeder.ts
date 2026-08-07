import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  DeviceId,
  UserId,
  CreateSubject,
  CreateFormula,
  CreateTeacher,
  CreateTeacherPayrollRule,
  CreateRoom,
  CreateParent,
  CreateStudent,
  CreateStudentSubscription,
  CreateGroup,
  EnrollStudent,
  CreateWeeklyRecurringSession,
  GenerateAndPersistSessions,
  SaveCenterHours,
  SaveCenterProfile,
  CreateAdminAccount,
  GenerateMonthlyInvoices,
  IssueInvoice,
  RecordPayment,
  ComputeMonthlyPayrolls,
  ConfirmTeacherPayout,
  ListInvoices,
  ListTeacherPayouts,
  PlanId,
} from '@centresoutien/domain';
import type { InvoiceId, WeeklyRecurringSessionId } from '@centresoutien/domain';
import {
  DEMO_ANCHOR_MONTH,
  DEMO_CENTER_PROFILE,
  DEMO_ADMIN,
  DEMO_WEEK,
  DEMO_SUBJECTS,
  DEMO_FORMULAS,
  DEMO_ROOMS,
  DEMO_TEACHERS,
  DEMO_STUDENT_COUNT,
  demoStudentName,
  demoStudentLevel,
  demoStudentBirthDate,
  demoParentForStudent,
  demoFormulaIndexForStudent,
} from './demo-dataset';
import { writeDemoSeededMarker } from './demo-marker';
import { normalizePhone } from '@centresoutien/domain';

/**
 * SOU-110 — the demo center seeder. Drives the EXISTING wired domain use cases
 * (never raw SQL for entities), so envelopes, change-log rows, plan gates,
 * natural keys, and duplicate guards are all respected for free. Runs under the
 * demo container's FIXED clock + deterministic IdGenerator, so every run is
 * byte-identical. The only raw write is the `app_meta` demo marker (the
 * sanctioned exception, like `resolveDeviceOrigin`).
 *
 * The `DemoSeedDeps` interface is the narrow subset of wired use cases the
 * seeder needs; the composition root passes the same wired instances `HandlerDeps`
 * exposes. This keeps the data layer free of any main-process import.
 */

/** The deps the seeder drives — a subset of the composition root's wired use cases. */
export type DemoSeedDeps = {
  saveCenterProfile: Pick<SaveCenterProfile, 'execute'>;
  saveCenterHours: Pick<SaveCenterHours, 'execute'>;
  createSubject: Pick<CreateSubject, 'execute'>;
  createFormula: Pick<CreateFormula, 'execute'>;
  createTeacher: Pick<CreateTeacher, 'execute'>;
  createTeacherPayrollRule: Pick<CreateTeacherPayrollRule, 'execute'>;
  createRoom: Pick<CreateRoom, 'execute'>;
  createParent: Pick<CreateParent, 'execute'>;
  createStudent: Pick<CreateStudent, 'execute'>;
  createStudentSubscription: Pick<CreateStudentSubscription, 'execute'>;
  createGroup: Pick<CreateGroup, 'execute'>;
  enrollStudent: Pick<EnrollStudent, 'execute'>;
  createWeeklySession: Pick<CreateWeeklyRecurringSession, 'execute'>;
  generateSessions: Pick<GenerateAndPersistSessions, 'execute'>;
  generateMonthlyInvoices: Pick<GenerateMonthlyInvoices, 'execute'>;
  issueInvoice: Pick<IssueInvoice, 'execute'>;
  recordPayment: Pick<RecordPayment, 'execute'>;
  computeMonthlyPayrolls: Pick<ComputeMonthlyPayrolls, 'execute'>;
  confirmTeacherPayout: Pick<ConfirmTeacherPayout, 'execute'>;
  listInvoices: Pick<ListInvoices, 'execute'>;
  listTeacherPayouts: Pick<ListTeacherPayouts, 'execute'>;
  createAdminAccount: Pick<CreateAdminAccount, 'execute'>;
};

export type DemoSeedContext = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** The demo DB handle — used ONLY for the sanctioned `app_meta` marker. */
  db: DB;
  /** Plan seeded onto the center row / used implicitly by gated use cases. */
  seedPlan: PlanId;
};

/**
 * Seed the demo center with the full deterministic dataset:
 *
 *  center profile → hours → subjects → formulas → teachers → payroll rules →
 *  rooms → parents → students (with guardians) → subscriptions → groups →
 *  enrollments → weekly sessions → materialized Sept sessions → invoices
 *  (Aug + Sept, mixed paid/partial/unpaid) → payroll (draft + confirmed) →
 *  admin account → demo marker.
 *
 * `updatedBy`/`deviceOrigin` come from the demo container's envelope context so
 * the change log attributes every seeded write to the demo device/user, exactly
 * like real writes.
 */
export async function seedDemoCenter(deps: DemoSeedDeps, ctx: DemoSeedContext): Promise<void> {
  const env = { centerCode: ctx.centerCode, deviceOrigin: ctx.deviceOrigin, updatedBy: ctx.updatedBy };

  // 1. Center profile + hours (foundation for sessions, invoices, payroll).
  await deps.saveCenterProfile.execute({
    name: DEMO_CENTER_PROFILE.name,
    address: DEMO_CENTER_PROFILE.address,
    phone: normalizePhone(DEMO_CENTER_PROFILE.phone),
    email: DEMO_CENTER_PROFILE.email,
    logoPath: null,
    ...env,
    seedPlan: ctx.seedPlan,
  });
  await deps.saveCenterHours.execute({ ...env, week: [...DEMO_WEEK] });

  // 2. Subjects → formulas (billing bundles) → teachers → payroll rules.
  const subjectIds = new Map<number, string>();
  for (let i = 0; i < DEMO_SUBJECTS.length; i += 1) {
    const subject = DEMO_SUBJECTS[i]!;
    const created = await deps.createSubject.execute({
      name: subject.name,
      code: subject.code,
      ...env,
    });
    subjectIds.set(i, created.id);
  }

  const formulaIds = new Map<number, string>();
  for (let i = 0; i < DEMO_FORMULAS.length; i += 1) {
    const formula = DEMO_FORMULAS[i]!;
    const created = await deps.createFormula.execute({
      name: formula.name,
      subjectIds: formula.subjectIndices.map((idx) => subjectIds.get(idx)!),
      priceMad: formula.priceMad,
      kind: formula.kind,
      ...env,
    });
    formulaIds.set(i, created.id);
  }

  const teacherIds = new Map<number, string>();
  for (let i = 0; i < DEMO_TEACHERS.length; i += 1) {
    const teacher = DEMO_TEACHERS[i]!;
    const created = await deps.createTeacher.execute({
      name: teacher.name,
      cin: teacher.cin,
      phone: normalizePhone(teacher.phone),
      email: teacher.email,
      subjectIds: teacher.subjectIndices.map((idx) => subjectIds.get(idx)!),
      ...env,
    });
    teacherIds.set(i, created.id);
  }

  // Even-indexed teachers: fixed monthly; odd-indexed: % of attributable fees.
  for (let i = 0; i < DEMO_TEACHERS.length; i += 1) {
    const base = { teacherId: teacherIds.get(i)!, startMonth: '2026-08', endMonth: null, ...env };
    await deps.createTeacherPayrollRule.execute(
      i % 2 === 0
        ? { ...base, kind: 'fixed-monthly' as const, amountMad: 300000 }
        : { ...base, kind: 'percentage-of-monthly-fees' as const, percent: 30 },
    );
  }

  // 3. Rooms (capacity ≥ every group's 25 so assertGroupFitsRoom passes).
  const roomIds: string[] = [];
  for (const room of DEMO_ROOMS) {
    const created = await deps.createRoom.execute({ name: room.name, capacity: room.capacity, ...env });
    roomIds.push(created.id);
  }

  // 4. Parents → students (each student linked to its own guardian).
  const parentIds: string[] = [];
  const studentIds: string[] = [];
  for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
    const guardian = demoParentForStudent(i);
    const parent = await deps.createParent.execute({
      name: guardian.name,
      phone: normalizePhone(guardian.phone),
      email: guardian.email,
      relation: guardian.relation,
      whatsappOptIn: false,
      ...env,
    });
    parentIds.push(parent.id);

    const name = demoStudentName(i);
    const student = await deps.createStudent.execute({
      name,
      birthDate: demoStudentBirthDate(i),
      level: demoStudentLevel(i),
      school: null,
      notes: null,
      guardianIds: [parent.id],
      ...env,
    });
    studentIds.push(student.id);
  }

  // 5. Subscriptions (frozen formula snapshot) — all start the month before the
  //    anchor so both Aug and Sept are billable (mixed invoice states incl.
  //    overdue, which requires a prior month to be past due).
  for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
    const formulaIndex = demoFormulaIndexForStudent(i);
    const formula = DEMO_FORMULAS[formulaIndex]!;
    await deps.createStudentSubscription.execute({
      studentId: studentIds[i]!,
      formulaId: formulaIds.get(formulaIndex)!,
      kind: formula.kind,
      subjectIds: formula.subjectIndices.map((idx) => subjectIds.get(idx)!),
      startMonth: '2026-08',
      endMonth: null,
      ...env,
    });
  }

  // 6. Groups — enough regular groups per subject to hold the students whose
  //    formula's primary subject it is (25 seats each), plus one exam-prep group.
  //    Students are bucketed by primary subject first, then round-robined across
  //    that subject's groups, so no group ever overflows `GroupFullError`.
  const regularStudentsBySubject = new Map<number, number[]>();
  const examPrepStudents: number[] = [];
  for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
    const formulaIndex = demoFormulaIndexForStudent(i);
    const formula = DEMO_FORMULAS[formulaIndex]!;
    if (formula.kind === 'exam-prep') {
      examPrepStudents.push(i);
    } else {
      const subject = formula.subjectIndices[0]!;
      const bucket = regularStudentsBySubject.get(subject) ?? [];
      bucket.push(i);
      regularStudentsBySubject.set(subject, bucket);
    }
  }

  const GROUP_SEATS = 25;
  const groupIds: string[] = [];
  const groupTeacherIds: string[] = [];
  const groupOfStudent = new Map<number, string>();
  for (let subject = 0; subject < DEMO_SUBJECTS.length; subject += 1) {
    const students = regularStudentsBySubject.get(subject) ?? [];
    const groupCount = Math.max(1, Math.ceil(students.length / GROUP_SEATS));
    const groups: string[] = [];
    for (let g = 0; g < groupCount; g += 1) {
      const created = await deps.createGroup.execute({
        subjectId: subjectIds.get(subject)!,
        teacherId: teacherIds.get(subject)!,
        level: 'TC',
        capacity: GROUP_SEATS,
        kind: 'regular',
        ...env,
      });
      groups.push(created.id);
      groupIds.push(created.id);
      groupTeacherIds.push(teacherIds.get(subject)!);
    }
    students.forEach((student, position) => groupOfStudent.set(student, groups[position % groups.length]!));
  }
  const examPrepGroupId = (
    await deps.createGroup.execute({
      subjectId: subjectIds.get(0)!,
      teacherId: teacherIds.get(0)!,
      level: '2 Bac SM',
      capacity: 25,
      kind: 'exam-prep',
      ...env,
    })
  ).id;
  groupIds.push(examPrepGroupId);
  groupTeacherIds.push(teacherIds.get(0)!);

  // 7. Enrollments — each student into the group mapped above (regular) or the
  //    exam-prep group. Kind matches; the subscription's subjectIds cover the
  //    group's subject, so `EnrollStudent`'s guards pass.
  for (let i = 0; i < DEMO_STUDENT_COUNT; i += 1) {
    const groupId = examPrepStudents.includes(i) ? examPrepGroupId : groupOfStudent.get(i)!;
    await deps.enrollStudent.execute({
      studentId: studentIds[i]!,
      groupId,
      startMonth: '2026-08',
      endMonth: null,
      ...env,
    });
  }

  // 8. Weekly recurring sessions — one per group, conflict-free. Room `i % 6`
  //    and day `1 + (i % 6)` recur every 6 groups, so the start time is banded by
  //    `floor(i / 6)` (10:00 / 13:00 / 15:00) — a same-room same-day pair is always
  //    3h apart, never overlapping. Each group's teacher teaches its own subject,
  //    so a teacher never has two same-day slots (their groups are 8 apart → days
  //    differ by 2). All slots sit inside the 09:00–18:00 center hours.
  const recurringIds: WeeklyRecurringSessionId[] = [];
  const SLOT_STARTS = ['10:00', '13:00', '15:00'] as const;
  const SLOT_DURATION: Record<string, { end: string }> = {
    '10:00': { end: '11:30' },
    '13:00': { end: '14:30' },
    '15:00': { end: '16:30' },
  };
  for (let i = 0; i < groupIds.length; i += 1) {
    const start = SLOT_STARTS[Math.min(Math.floor(i / 6), SLOT_STARTS.length - 1)]!;
    const created = await deps.createWeeklySession.execute({
      roomId: roomIds[i % roomIds.length]!,
      teacherId: groupTeacherIds[i]!,
      groupId: groupIds[i]!,
      dayOfWeek: 1 + (i % 6),
      start,
      end: SLOT_DURATION[start]!.end,
      active: true,
      validFrom: null,
      validTo: null,
      ...env,
    });
    recurringIds.push(created.id);
  }

  // 9. Materialize concrete Sept sessions from each template.
  const range = { start: '2026-09-01', end: '2026-09-30' };
  for (const recurringSessionId of recurringIds) {
    await deps.generateSessions.execute({ recurringSessionId, range, ...env });
  }

  // 10. Invoices: generate for Aug (prior month → overdue potential) and Sept
  //     (the anchor month), then issue every draft so payments can attach.
  await deps.generateMonthlyInvoices.execute({ month: '2026-08', ...env });
  await deps.generateMonthlyInvoices.execute({ month: DEMO_ANCHOR_MONTH, ...env });
  const invoiceIds: InvoiceId[] = [];
  for (const month of ['2026-08', DEMO_ANCHOR_MONTH]) {
    const rows = await deps.listInvoices.execute({ centerCode: ctx.centerCode, month });
    for (const row of rows) {
      await deps.issueInvoice.execute({ centerCode: ctx.centerCode, invoiceId: row.invoice.id, updatedBy: ctx.updatedBy });
      invoiceIds.push(row.invoice.id);
    }
  }

  // 11. Payments — deterministic mixed states:
  //     - Aug invoices (the first half of the list): mostly paid (cash), a
  //       few left unpaid → overdue by the Sept anchor date.
  //     - Sept invoices (the rest): paid / partially-paid / unpaid mix.
  const augCount = Math.floor(invoiceIds.length / 2);
  for (let i = 0; i < invoiceIds.length; i += 1) {
    const invoiceId = invoiceIds[i]!;
    const [invoice] = await deps.listInvoices.execute({
      centerCode: ctx.centerCode,
      invoiceId,
    });
    if (!invoice) continue;
    const totalMad = invoice.totalMad;
    const isAug = i < augCount;
    const bucket = isAug ? i % 10 : (i - augCount) % 10;
    const paidOn = isAug ? '2026-08-12' : '2026-09-05';
    if (bucket === 9) continue; // unpaid → overdue (Aug) / unpaid (Sept)
    if (!isAug && bucket === 7) {
      await deps.recordPayment.execute({
        invoiceId,
        amountMad: Math.floor(totalMad / 2),
        method: 'cash',
        paidOn,
        note: null,
        ...env,
      });
      continue;
    }
    await deps.recordPayment.execute({
      invoiceId,
      amountMad: totalMad,
      method: i % 2 === 0 ? 'cash' : 'cheque',
      paidOn,
      note: null,
      ...env,
    });
  }

  // 12. Payroll — compute drafts for the anchor month, then confirm a subset
  //     so the history shows both draft and paid payouts.
  await deps.computeMonthlyPayrolls.execute({ month: DEMO_ANCHOR_MONTH, ...env });
  const payouts = await deps.listTeacherPayouts.execute({ centerCode: ctx.centerCode, month: DEMO_ANCHOR_MONTH });
  for (let i = 0; i < payouts.length; i += 1) {
    if (i % 2 === 0) {
      await deps.confirmTeacherPayout.execute({
        centerCode: ctx.centerCode,
        teacherPayoutId: payouts[i]!.id,
        updatedBy: ctx.updatedBy,
      });
    }
  }

  // 13. Admin account (fixed demo login) then the sanctioned app_meta marker.
  await deps.createAdminAccount.execute({ username: DEMO_ADMIN.username, password: DEMO_ADMIN.password });
  writeDemoSeededMarker(ctx.db);
}

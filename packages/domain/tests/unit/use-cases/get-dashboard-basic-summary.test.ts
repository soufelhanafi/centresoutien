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
import type { FormulaId } from '../../../src/entities/formula';
import type { RoomId } from '../../../src/entities/room';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySessionRepository } from '../fakes/in-memory-session-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TODAY_ISO = '2026-08-15T09:00:00Z';
const TODAY = '2026-08-15';
const CURRENT_MONTH = '2026-08';
const ROOM = 'rom_00000000000000000000000001' as RoomId;

const clock = () => fakeClock(TODAY_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock());

let sessionSeq = 0;
function makeSession(date: string): Session {
  sessionSeq += 1;
  return {
    id: `ses_${String(sessionSeq).padStart(26, '0')}` as SessionId,
    ...envelope(),
    recurringSessionId: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    date,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
  };
}

let studentSeq = 0;
function makeStudent(): Student {
  studentSeq += 1;
  return {
    id: `stu_${String(studentSeq).padStart(26, '0')}` as StudentId,
    ...envelope(),
    naturalKey: `${CENTER}::student-${studentSeq}::2010-01-01`,
    name: { fr: `Élève ${studentSeq}`, ar: `تلميذ ${studentSeq}` },
    birthDate: '2010-01-01',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
  };
}

let invoiceSeq = 0;
function makeInvoiceWithLine(
  status: InvoiceStatus,
  amountMad: number,
): { invoice: Invoice; line: InvoiceLine } {
  invoiceSeq += 1;
  const invoice: Invoice = {
    id: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    ...envelope(),
    studentId: `stu_${String(invoiceSeq).padStart(26, '0')}` as StudentId,
    month: CURRENT_MONTH,
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
    amountMad,
  };
  return { invoice, line };
}

describe('GetDashboardBasicSummary', () => {
  let sessions: InMemorySessionRepository;
  let students: InMemoryStudentRepository;
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan = PLANS.essentiel): GetDashboardBasicSummary {
    return new GetDashboardBasicSummary(sessions, students, invoices, clock(), new PlanPolicy(plan));
  }

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    students = new InMemoryStudentRepository();
    invoices = new InMemoryInvoiceRepository();
    sessionSeq = 0;
    studentSeq = 0;
    invoiceSeq = 0;
  });

  it('counts only sessions dated today, not yesterday or tomorrow', async () => {
    await sessions.save(makeSession(TODAY));
    await sessions.save(makeSession(TODAY));
    await sessions.save(makeSession('2026-08-14'));
    await sessions.save(makeSession('2026-08-16'));

    const result = await build().execute({ centerCode: CENTER });

    expect(result.todaysSessionCount).toBe(2);
  });

  it('excludes a cancelled (soft-deleted) session dated today', async () => {
    const cancelled = makeSession(TODAY);
    await sessions.save(cancelled);
    await sessions.softDelete(cancelled.id, clock().now(), USER);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.todaysSessionCount).toBe(0);
  });

  it('counts live students only, excluding archived ones', async () => {
    const alive = makeStudent();
    const archived = makeStudent();
    await students.save(alive);
    await students.save(archived);
    await students.softDelete(archived.id, clock().now(), USER);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.activeStudentCount).toBe(1);
  });

  it('counts an issued invoice with zero payments as unpaid', async () => {
    const { invoice, line } = makeInvoiceWithLine('issued', 20000);
    await invoices.createDraft(invoice, [line]);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.unpaidInvoiceCount).toBe(1);
  });

  it('counts a partially-paid issued invoice as unpaid', async () => {
    const { invoice, line } = makeInvoiceWithLine('issued', 20000);
    await invoices.createDraft(invoice, [line]);
    invoices.setNetPaid(invoice.id, 5000);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.unpaidInvoiceCount).toBe(1);
  });

  it('excludes a fully-paid issued invoice', async () => {
    const { invoice, line } = makeInvoiceWithLine('issued', 20000);
    await invoices.createDraft(invoice, [line]);
    invoices.setNetPaid(invoice.id, 20000);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.unpaidInvoiceCount).toBe(0);
  });

  it('excludes a draft invoice — nothing is owed yet', async () => {
    const { invoice, line } = makeInvoiceWithLine('draft', 20000);
    await invoices.createDraft(invoice, [line]);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.unpaidInvoiceCount).toBe(0);
  });

  it('excludes a cancelled invoice — nothing is owed anymore', async () => {
    const { invoice, line } = makeInvoiceWithLine('cancelled', 20000);
    await invoices.createDraft(invoice, [line]);

    const result = await build().execute({ centerCode: CENTER });

    expect(result.unpaidInvoiceCount).toBe(0);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks dashboard.basic', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

    await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});

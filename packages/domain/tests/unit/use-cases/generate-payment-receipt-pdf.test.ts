import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratePaymentReceiptPdf, type GeneratePaymentReceiptPdfInput } from '../../../src/use-cases/generate-payment-receipt-pdf';
import { GetStudent } from '../../../src/use-cases/get-student';
import type { PaymentReceiptPdfInput } from '../../../src/ports/payment-receipt-pdf-renderer';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { PaymentNotFoundError } from '../../../src/errors/payment-errors';
import { InvoiceNotFoundError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { Invoice, InvoiceId } from '../../../src/entities/invoice';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Center } from '../../../src/entities/center';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT_ID = 'pay_00000000000000000000000001' as PaymentId;

const envelopeClock = fakeClock('2026-08-01T00:00:00Z');
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock);

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: STUDENT_ID,
    ...envelope(),
    naturalKey: `${CENTER}::yassine-alaoui::2009-05-01`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2009-05-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    ...envelope(),
    studentId: STUDENT_ID,
    month: '2026-09',
    status: 'issued',
    issuedAt: new Date('2026-08-01T10:00:00Z'),
    cancelledAt: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    ...envelope(),
    invoiceId: INVOICE_ID,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-05',
    reversesPaymentId: null,
    note: 'chèque n°1234',
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

class FakePaymentReceiptPdfRenderer {
  lastInput: PaymentReceiptPdfInput | null = null;

  async render(input: PaymentReceiptPdfInput): Promise<Uint8Array> {
    this.lastInput = input;
    return new Uint8Array([1, 2, 3]);
  }
}

const input = (overrides: Partial<GeneratePaymentReceiptPdfInput> = {}) =>
  ({ centerCode: CENTER, paymentId: PAYMENT_ID, locale: 'fr', ...overrides }) satisfies GeneratePaymentReceiptPdfInput;

describe('GeneratePaymentReceiptPdf', () => {
  let payments: InMemoryPaymentRepository;
  let invoices: InMemoryInvoiceRepository;
  let students: InMemoryStudentRepository;
  let renderer: FakePaymentReceiptPdfRenderer;
  let center: Center | null;

  beforeEach(async () => {
    payments = new InMemoryPaymentRepository();
    invoices = new InMemoryInvoiceRepository();
    students = new InMemoryStudentRepository();
    renderer = new FakePaymentReceiptPdfRenderer();
    center = CENTER_PROFILE;
    await invoices.createDraft(makeInvoice(), []);
    await payments.append(makePayment());
    await students.save(makeStudent());
  });

  function build(plan: Plan): GeneratePaymentReceiptPdf {
    return new GeneratePaymentReceiptPdf(
      payments,
      invoices,
      new GetStudent(students, new PlanPolicy(plan)),
      { execute: async () => center },
      { execute: async () => null },
      renderer,
      new PlanPolicy(plan),
    );
  }

  describe('happy path', () => {
    it('renders the receipt from the payment, its invoice, and the student/center profile', async () => {
      const result = await build(PLANS.pro).execute(input());

      expect(result).toEqual({ paymentId: PAYMENT_ID, bytes: new Uint8Array([1, 2, 3]) });
      expect(renderer.lastInput).toMatchObject({
        locale: 'fr',
        paymentId: PAYMENT_ID,
        invoiceId: INVOICE_ID,
        kind: 'payment',
        amountMad: 20000,
        method: 'cash',
        paidOn: '2026-08-05',
        note: 'chèque n°1234',
        month: '2026-09',
        student: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        center: { name: 'Centre Soutien Casa' },
      });
    });

    it('renders a reversal row with its own kind, not relabelled as a payment', async () => {
      const reversalId = 'pay_00000000000000000000000002' as PaymentId;
      await payments.append(makePayment({ id: reversalId, kind: 'reversal', reversesPaymentId: PAYMENT_ID, note: null }));

      await build(PLANS.pro).execute(input({ paymentId: reversalId }));

      expect(renderer.lastInput).toMatchObject({ kind: 'reversal', note: null });
    });

    it('falls back to an em dash for the student once the record is archived', async () => {
      await students.softDelete(STUDENT_ID, new Date('2026-08-02T00:00:00Z'), USER);

      await build(PLANS.pro).execute(input());

      expect(renderer.lastInput?.student).toEqual({ fr: '—', ar: '—' });
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
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute(input())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(renderer.lastInput).toBeNull();
    });
  });

  describe('payment resolution / tenant scoping', () => {
    it('throws PaymentNotFoundError for an unknown payment id', async () => {
      await expect(
        build(PLANS.pro).execute(input({ paymentId: 'pay_00000000000000000000000099' as PaymentId })),
      ).rejects.toBeInstanceOf(PaymentNotFoundError);
    });

    it('throws PaymentNotFoundError for a payment in another center (no cross-tenant read)', async () => {
      const other = 'pay_00000000000000000000000007' as PaymentId;
      await payments.append(makePayment({ id: other, centerCode: OTHER_CENTER }));

      await expect(build(PLANS.pro).execute(input({ paymentId: other }))).rejects.toBeInstanceOf(
        PaymentNotFoundError,
      );
    });
  });

  describe('invoice resolution / tenant scoping', () => {
    it('throws InvoiceNotFoundError when the payment points at an invoice in another center', async () => {
      const otherInvoice = 'inv_00000000000000000000000002' as InvoiceId;
      await invoices.createDraft(makeInvoice({ id: otherInvoice, centerCode: OTHER_CENTER }), []);
      const orphanPayment = 'pay_00000000000000000000000008' as PaymentId;
      await payments.append(makePayment({ id: orphanPayment, invoiceId: otherInvoice }));

      await expect(build(PLANS.pro).execute(input({ paymentId: orphanPayment }))).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );
    });
  });
});

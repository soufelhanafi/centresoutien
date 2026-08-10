import type { InvoiceListItemView } from './invoice-view';

/**
 * In-memory stand-in for the not-yet-published `invoice.list` / `invoice.get`
 * channels (see `invoices-gateway.ts`). Covers every status the list/detail
 * screens must render: draft, issued+unpaid, issued+partially-paid,
 * issued+paid, and cancelled.
 */
export const INVOICE_SEED: readonly InvoiceListItemView[] = [
  {
    id: 'inv_01HW0SEED00000000000000001',
    studentId: 'stu_01HW0SEED0000000000000001',
    studentName: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    month: '2026-07',
    status: 'draft',
    issuedAt: null,
    lines: [
      {
        id: 'invl_01HW0SEED00000000000000001',
        formulaId: 'form_01HW0SEED00000000000000001',
        label: { fr: 'Math + Physique', ar: 'رياضيات + فيزياء' },
        kind: 'regular',
        amountMad: 35000,
      },
    ],
    totalMad: 35000,
    netPaidMad: 0,
    outstandingMad: 35000,
    paymentStatus: 'unpaid',
  },
  {
    id: 'inv_01HW0SEED00000000000000002',
    studentId: 'stu_01HW0SEED0000000000000002',
    studentName: { fr: 'Salma Bennani', ar: 'سلمى بناني' },
    month: '2026-07',
    status: 'issued',
    issuedAt: '2026-07-01T08:00:00.000Z',
    lines: [
      {
        id: 'invl_01HW0SEED00000000000000002',
        formulaId: 'form_01HW0SEED00000000000000002',
        label: { fr: 'Français seul', ar: 'الفرنسية فقط' },
        kind: 'regular',
        amountMad: 20000,
      },
    ],
    totalMad: 20000,
    netPaidMad: 0,
    outstandingMad: 20000,
    paymentStatus: 'unpaid',
  },
  {
    id: 'inv_01HW0SEED00000000000000003',
    studentId: 'stu_01HW0SEED0000000000000003',
    studentName: { fr: 'Omar Idrissi', ar: 'عمر الإدريسي' },
    month: '2026-07',
    status: 'issued',
    issuedAt: '2026-07-01T08:00:00.000Z',
    lines: [
      {
        id: 'invl_01HW0SEED00000000000000003',
        formulaId: 'form_01HW0SEED00000000000000003',
        label: { fr: 'Math + SVT + Géo', ar: 'رياضيات + علوم الحياة والأرض + جغرافيا' },
        kind: 'regular',
        amountMad: 55000,
      },
    ],
    totalMad: 55000,
    netPaidMad: 25000,
    outstandingMad: 30000,
    paymentStatus: 'partially-paid',
  },
  {
    id: 'inv_01HW0SEED00000000000000004',
    studentId: 'stu_01HW0SEED0000000000000001',
    studentName: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    month: '2026-06',
    status: 'issued',
    issuedAt: '2026-06-01T08:00:00.000Z',
    lines: [
      {
        id: 'invl_01HW0SEED00000000000000004',
        formulaId: 'form_01HW0SEED00000000000000004',
        label: { fr: 'Math seul', ar: 'رياضيات فقط' },
        kind: 'regular',
        amountMad: 20000,
      },
      {
        id: 'invl_01HW0SEED00000000000000005',
        formulaId: 'form_01HW0SEED00000000000000005',
        label: { fr: 'Préparation Bac Math', ar: 'تحضير الباكالوريا رياضيات' },
        kind: 'exam-prep',
        amountMad: 80000,
      },
    ],
    totalMad: 100000,
    netPaidMad: 100000,
    outstandingMad: 0,
    paymentStatus: 'paid',
  },
  {
    id: 'inv_01HW0SEED00000000000000005',
    studentId: 'stu_01HW0SEED0000000000000002',
    studentName: { fr: 'Salma Bennani', ar: 'سلمى بناني' },
    month: '2026-06',
    status: 'cancelled',
    issuedAt: '2026-06-01T08:00:00.000Z',
    lines: [
      {
        id: 'invl_01HW0SEED00000000000000006',
        formulaId: 'form_01HW0SEED00000000000000006',
        label: { fr: 'Anglais seul', ar: 'الإنجليزية فقط' },
        kind: 'regular',
        amountMad: 15000,
      },
    ],
    totalMad: 15000,
    netPaidMad: 0,
    outstandingMad: 15000,
    paymentStatus: 'unpaid',
  },
];

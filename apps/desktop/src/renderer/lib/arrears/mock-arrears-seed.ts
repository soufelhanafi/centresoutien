import type { ArrearsParentGroupView } from './arrears-view';

/**
 * In-memory stand-in for the not-yet-published `arrears.list` channel (see
 * `arrears-gateway.ts`). Covers every aging bucket (30/60/90+), both derived
 * overdue statuses, a parent with more than one child in arrears, and one
 * invoice tagged with a `groupId` so the group filter has something to match.
 * Parent/student names mirror the `desktop-design.html` "Parents /
 * Responsables" sample data (screen 2i) for visual continuity.
 */
export const ARREARS_PARENT_SEED: readonly ArrearsParentGroupView[] = [
  {
    parentId: 'par_01HW0SEED00000000000000001',
    parentName: 'Karim Idrissi',
    parentPhone: '+212 6 61 00 00 01',
    totalOutstandingMad: 55000,
    oldestAgingBucket: '60',
    invoices: [
      {
        invoiceId: 'inv_01HW0SEED00000000000000101',
        studentId: 'stu_01HW0SEED00000000000000011',
        studentName: { fr: 'Yasmine Idrissi', ar: 'ياسمين الإدريسي' },
        groupId: 'grp_01HW0SEED00000000000000001',
        month: '2026-07',
        outstandingMad: 35000,
        monthsOverdue: 1,
        agingBucket: '30',
        status: 'unpaid',
      },
      {
        invoiceId: 'inv_01HW0SEED00000000000000102',
        studentId: 'stu_01HW0SEED00000000000000012',
        studentName: { fr: 'Adam Idrissi', ar: 'آدم الإدريسي' },
        groupId: null,
        month: '2026-06',
        outstandingMad: 20000,
        monthsOverdue: 2,
        agingBucket: '60',
        status: 'partially-paid',
      },
    ],
  },
  {
    parentId: 'par_01HW0SEED00000000000000002',
    parentName: 'Samira Benali',
    parentPhone: '+212 6 62 00 00 02',
    totalOutstandingMad: 55000,
    oldestAgingBucket: '90+',
    invoices: [
      {
        invoiceId: 'inv_01HW0SEED00000000000000103',
        studentId: 'stu_01HW0SEED00000000000000013',
        studentName: { fr: 'Omar Benali', ar: 'عمر بنعلي' },
        groupId: null,
        month: '2026-05',
        outstandingMad: 55000,
        monthsOverdue: 3,
        agingBucket: '90+',
        status: 'unpaid',
      },
    ],
  },
  {
    parentId: 'par_01HW0SEED00000000000000003',
    parentName: 'Hicham Tazi',
    parentPhone: '+212 6 63 00 00 03',
    totalOutstandingMad: 10000,
    oldestAgingBucket: '30',
    invoices: [
      {
        invoiceId: 'inv_01HW0SEED00000000000000104',
        studentId: 'stu_01HW0SEED00000000000000014',
        studentName: { fr: 'Salma Tazi', ar: 'سلمى التازي' },
        groupId: 'grp_01HW0SEED00000000000000001',
        month: '2026-07',
        outstandingMad: 10000,
        monthsOverdue: 1,
        agingBucket: '30',
        status: 'partially-paid',
      },
    ],
  },
];

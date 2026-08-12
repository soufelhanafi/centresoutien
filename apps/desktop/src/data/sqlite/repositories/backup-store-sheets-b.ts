import type { SheetSqlConfig } from './backup-store-config';

const ENVELOPE_COLUMNS: readonly (readonly [string, string])[] = [
  ['id', 'id'],
  ['centerCode', 'center_code'],
  ['deviceOrigin', 'device_origin'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['updatedBy', 'updated_by'],
  ['deletedAt', 'deleted_at'],
  ['version', 'version'],
];

/** Sheet configs for the subscriptions, scheduling dependents, and billing tables. */
export const SHEET_SQL_B: Readonly<
  Record<
    | 'student-subscriptions'
    | 'enrollments'
    | 'weekly-recurring-sessions'
    | 'sessions'
    | 'invoices'
    | 'invoice-lines'
    | 'payments'
    | 'center-hours'
    | 'holidays',
    SheetSqlConfig
  >
> = {
  'student-subscriptions': {
    table: 'student_subscriptions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['formulaId', 'formula_id'],
      ['kind', 'kind'],
      ['subjectIds', 'subject_ids'],
      ['startMonth', 'start_month'],
      ['endMonth', 'end_month'],
    ],
  },
  enrollments: {
    table: 'enrollments',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['groupId', 'group_id'],
      ['startMonth', 'start_month'],
      ['endMonth', 'end_month'],
    ],
  },
  'weekly-recurring-sessions': {
    table: 'weekly_recurring_sessions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['roomId', 'room_id'],
      ['teacherId', 'teacher_id'],
      ['groupId', 'group_id'],
      ['dayOfWeek', 'day_of_week'],
      ['start', 'start_time'],
      ['end', 'end_time'],
      ['active', 'active'],
      ['validFrom', 'valid_from'],
      ['validTo', 'valid_to'],
      ['conflictAccepted', 'conflict_accepted'],
    ],
  },
  sessions: {
    table: 'sessions',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['recurringSessionId', 'recurring_session_id'],
      ['generationBatchId', 'generation_batch_id'],
      ['roomId', 'room_id'],
      ['teacherId', 'teacher_id'],
      ['groupId', 'group_id'],
      ['date', 'date'],
      ['start', 'start_time'],
      ['end', 'end_time'],
    ],
  },
  invoices: {
    table: 'invoices',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['studentId', 'student_id'],
      ['month', 'month'],
      ['status', 'status'],
      ['issuedAt', 'issued_at'],
      ['cancelledAt', 'cancelled_at'],
    ],
  },
  'invoice-lines': {
    table: 'invoice_lines',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['invoiceId', 'invoice_id'],
      ['formulaId', 'formula_id'],
      ['label_fr', 'label_fr'],
      ['label_ar', 'label_ar'],
      ['kind', 'kind'],
      ['amountMad', 'amount_mad'],
    ],
  },
  payments: {
    table: 'payments',
    conflict: 'skip',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['invoiceId', 'invoice_id'],
      ['kind', 'kind'],
      ['amountMad', 'amount_mad'],
      ['method', 'method'],
      ['paidOn', 'paid_on'],
      ['reversesPaymentId', 'reverses_payment_id'],
      ['note', 'note'],
    ],
  },
  'center-hours': {
    table: 'center_hours',
    conflict: 'upsert',
    columns: [...ENVELOPE_COLUMNS, ['dayOfWeek', 'day_of_week'], ['windows', 'windows']],
  },
  holidays: {
    table: 'holidays',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['kind', 'kind'],
      ['startDate', 'start_date'],
      ['endDate', 'end_date'],
    ],
  },
};

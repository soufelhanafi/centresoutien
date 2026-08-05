import type { BackupColumn, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS } from './backup-columns';

/** Compact column literal — `name` + `type`, non-optional by default. */
function c(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

/** Second half of the registry: subscriptions, scheduling dependents, billing. */
export const BACKUP_SHEETS_B: readonly BackupSheetSpec[] = [
  {
    name: 'student-subscriptions',
    idPrefix: 'sbs',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('studentId', 'string'),
      c('formulaId', 'string'),
      c('kind', 'string'),
      c('subjectIds', 'string'),
      c('startMonth', 'string'),
      c('endMonth', 'string-or-null'),
    ],
  },
  {
    name: 'enrollments',
    idPrefix: 'enr',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('studentId', 'string'),
      c('groupId', 'string'),
      c('startMonth', 'string'),
      c('endMonth', 'string-or-null'),
    ],
  },
  {
    name: 'weekly-recurring-sessions',
    idPrefix: 'wrs',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('roomId', 'string'),
      c('teacherId', 'string-or-null'),
      c('groupId', 'string-or-null'),
      c('dayOfWeek', 'number'),
      c('start', 'string'),
      c('end', 'string'),
      c('active', 'boolean'),
      c('validFrom', 'string-or-null'),
      c('validTo', 'string-or-null'),
    ],
  },
  {
    name: 'sessions',
    idPrefix: 'ses',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('recurringSessionId', 'string'),
      c('generationBatchId', 'string-or-null'),
      c('roomId', 'string'),
      c('teacherId', 'string-or-null'),
      c('groupId', 'string-or-null'),
      c('date', 'string'),
      c('start', 'string'),
      c('end', 'string'),
    ],
  },
  {
    name: 'invoices',
    idPrefix: 'inv',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('studentId', 'string'),
      c('month', 'string'),
      c('status', 'string'),
      c('issuedAt', 'string-or-null'),
      c('cancelledAt', 'string-or-null'),
    ],
  },
  {
    name: 'invoice-lines',
    idPrefix: 'invl',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('invoiceId', 'string'),
      c('formulaId', 'string'),
      c('label_fr', 'string'),
      c('label_ar', 'string'),
      c('kind', 'string'),
      c('amountMad', 'number'),
    ],
  },
  {
    name: 'payments',
    idPrefix: 'pay',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('invoiceId', 'string'),
      c('kind', 'string'),
      c('amountMad', 'number'),
      c('method', 'string'),
      c('paidOn', 'string'),
      c('reversesPaymentId', 'string-or-null'),
      c('note', 'string-or-null'),
    ],
  },
  {
    name: 'center-hours',
    idPrefix: 'chr',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('dayOfWeek', 'number'),
      c('open', 'string-or-null'),
      c('close', 'string-or-null'),
    ],
  },
  {
    name: 'holidays',
    idPrefix: 'hol',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('name_fr', 'string'),
      c('name_ar', 'string'),
      c('kind', 'string'),
      c('startDate', 'string'),
      c('endDate', 'string'),
    ],
  },
];

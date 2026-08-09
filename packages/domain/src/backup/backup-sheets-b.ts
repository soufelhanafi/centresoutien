import type { BackupColumn, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS } from './backup-columns';

/** Compact column literal — `name` + `type`, non-optional by default. */
function createRequiredColumn(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

/** Second half of the registry: subscriptions, scheduling dependents, billing. */
export const BACKUP_SHEETS_B: readonly BackupSheetSpec[] = [
  {
    name: 'student-subscriptions',
    idPrefix: 'sbs',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('studentId', 'string'),
      createRequiredColumn('formulaId', 'string'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('subjectIds', 'string'),
      createRequiredColumn('startMonth', 'string'),
      createRequiredColumn('endMonth', 'string-or-null'),
    ],
  },
  {
    name: 'enrollments',
    idPrefix: 'enr',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('studentId', 'string'),
      createRequiredColumn('groupId', 'string'),
      createRequiredColumn('startMonth', 'string'),
      createRequiredColumn('endMonth', 'string-or-null'),
    ],
  },
  {
    name: 'weekly-recurring-sessions',
    idPrefix: 'wrs',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('roomId', 'string'),
      createRequiredColumn('teacherId', 'string-or-null'),
      createRequiredColumn('groupId', 'string-or-null'),
      createRequiredColumn('dayOfWeek', 'number'),
      createRequiredColumn('start', 'string'),
      createRequiredColumn('end', 'string'),
      createRequiredColumn('active', 'boolean'),
      createRequiredColumn('validFrom', 'string-or-null'),
      createRequiredColumn('validTo', 'string-or-null'),
      // SOU-183: optional on import so a backup taken before this field existed
      // still restores — the absent column is skipped on write and the DB's
      // `DEFAULT 0` (migration 0039) supplies `conflictAccepted = false`.
      { name: 'conflictAccepted', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'sessions',
    idPrefix: 'ses',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('recurringSessionId', 'string'),
      createRequiredColumn('generationBatchId', 'string-or-null'),
      createRequiredColumn('roomId', 'string'),
      createRequiredColumn('teacherId', 'string-or-null'),
      createRequiredColumn('groupId', 'string-or-null'),
      createRequiredColumn('date', 'string'),
      createRequiredColumn('start', 'string'),
      createRequiredColumn('end', 'string'),
    ],
  },
  {
    name: 'invoices',
    idPrefix: 'inv',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('studentId', 'string'),
      createRequiredColumn('month', 'string'),
      createRequiredColumn('status', 'string'),
      createRequiredColumn('issuedAt', 'string-or-null'),
      createRequiredColumn('cancelledAt', 'string-or-null'),
    ],
  },
  {
    name: 'invoice-lines',
    idPrefix: 'invl',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('invoiceId', 'string'),
      createRequiredColumn('formulaId', 'string'),
      createRequiredColumn('label_fr', 'string'),
      createRequiredColumn('label_ar', 'string'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('amountMad', 'number'),
    ],
  },
  {
    name: 'payments',
    idPrefix: 'pay',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'skip',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('invoiceId', 'string'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('amountMad', 'number'),
      createRequiredColumn('method', 'string'),
      createRequiredColumn('paidOn', 'string'),
      createRequiredColumn('reversesPaymentId', 'string-or-null'),
      createRequiredColumn('note', 'string-or-null'),
    ],
  },
  {
    name: 'center-hours',
    idPrefix: 'chr',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('dayOfWeek', 'number'),
      createRequiredColumn('open', 'string-or-null'),
      createRequiredColumn('close', 'string-or-null'),
    ],
  },
  {
    name: 'holidays',
    idPrefix: 'hol',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('startDate', 'string'),
      createRequiredColumn('endDate', 'string'),
    ],
  },
];

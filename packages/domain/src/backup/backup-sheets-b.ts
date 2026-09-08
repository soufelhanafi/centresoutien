import type { BackupColumn, BackupColumnReference, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS } from './backup-columns';

/** Compact column literal — `name` + `type`, non-optional by default. */
function createRequiredColumn(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

/** Same as {@link createRequiredColumn}, plus a reference the import engine
 *  can repair (create a placeholder or drop the link) instead of only ever
 *  rejecting the row — see {@link BackupColumnReference}. */
function referenceColumn(name: string, type: BackupColumnType, reference: BackupColumnReference): BackupColumn {
  return { name, type, reference };
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
      referenceColumn('studentId', 'string', { sheet: 'students', kind: 'link', multiplicity: 'single' }),
      referenceColumn('formulaId', 'string', { sheet: 'formulas', kind: 'link', multiplicity: 'single' }),
      createRequiredColumn('kind', 'string'),
      referenceColumn('subjectIds', 'string', { sheet: 'subjects', kind: 'catalog', multiplicity: 'list' }),
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
      referenceColumn('studentId', 'string', { sheet: 'students', kind: 'link', multiplicity: 'single' }),
      referenceColumn('groupId', 'string', { sheet: 'groups', kind: 'link', multiplicity: 'single' }),
      createRequiredColumn('startMonth', 'string'),
      createRequiredColumn('endMonth', 'string-or-null'),
      // SOU-301 former-teacher snapshot. Optional on import so a backup taken
      // before this field existed still restores — the absent column is skipped
      // on write and the DB leaves `unenrolled_under_teacher_id` NULL (migration
      // 0051 adds it nullable, no default); the teacher roster attributes a null
      // snapshot to no one rather than guessing a teacher.
      {
        name: 'unenrolledUnderTeacherId',
        type: 'string-or-null',
        optional: true,
        reference: { sheet: 'teachers', kind: 'catalog', multiplicity: 'single' },
      },
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
      referenceColumn('roomId', 'string', { sheet: 'rooms', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('teacherId', 'string-or-null', { sheet: 'teachers', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('groupId', 'string-or-null', { sheet: 'groups', kind: 'link', multiplicity: 'single' }),
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
      referenceColumn('recurringSessionId', 'string', {
        sheet: 'weekly-recurring-sessions',
        kind: 'link',
        multiplicity: 'single',
      }),
      createRequiredColumn('generationBatchId', 'string-or-null'),
      referenceColumn('roomId', 'string', { sheet: 'rooms', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('teacherId', 'string-or-null', { sheet: 'teachers', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('groupId', 'string-or-null', { sheet: 'groups', kind: 'link', multiplicity: 'single' }),
      createRequiredColumn('date', 'string'),
      createRequiredColumn('start', 'string'),
      createRequiredColumn('end', 'string'),
    ],
  },
  {
    name: 'invoices',
    idPrefix: 'inv',
    idIsDeterministic: true,
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      referenceColumn('studentId', 'string', { sheet: 'students', kind: 'link', multiplicity: 'single' }),
      createRequiredColumn('month', 'string'),
      createRequiredColumn('status', 'string'),
      createRequiredColumn('issuedAt', 'string-or-null'),
      createRequiredColumn('cancelledAt', 'string-or-null'),
    ],
  },
  {
    name: 'invoice-lines',
    idPrefix: 'invl',
    idIsDeterministic: true,
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      referenceColumn('invoiceId', 'string', { sheet: 'invoices', kind: 'link', multiplicity: 'single' }),
      referenceColumn('formulaId', 'string', { sheet: 'formulas', kind: 'link', multiplicity: 'single' }),
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
      referenceColumn('invoiceId', 'string', { sheet: 'invoices', kind: 'link', multiplicity: 'single' }),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('amountMad', 'number'),
      createRequiredColumn('method', 'string'),
      createRequiredColumn('paidOn', 'string'),
      referenceColumn('reversesPaymentId', 'string-or-null', { sheet: 'payments', kind: 'link', multiplicity: 'single' }),
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
      createRequiredColumn('windows', 'string'),
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

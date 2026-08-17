import type { BackupColumn, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS } from './backup-columns';

// Compact column literal — `name` + `type`, non-optional by default.
function createRequiredColumn(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

// Third half of the registry: the synced settings tables (SOU-264) — the
// time-boxed center-hours overrides and the teacher-availability pair. They sit
// after `holidays` in the import order because they reference the teachers
// sheet; the workbook round-trips them byte-for-byte like every other entity.
export const BACKUP_SHEETS_C: readonly BackupSheetSpec[] = [
  {
    name: 'center-hours-overrides',
    idPrefix: 'cho',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('startDate', 'string'),
      createRequiredColumn('endDate', 'string'),
      // Weekly-window JSON, one opaque string like the center-hours `windows`
      // cell (SOU-264): the ordered/non-overlapping invariants are enforced by
      // the domain schema and the SQLite column just stores the validated JSON
      // text, so the workbook round-trips it byte-for-byte.
      createRequiredColumn('hoursByWeekday', 'string'),
    ],
  },
  {
    name: 'teacher-availability',
    idPrefix: 'tav',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('teacherId', 'string'),
      // Same opaque weekly-window JSON contract as `hoursByWeekday`.
      createRequiredColumn('weeklyWindows', 'string'),
    ],
  },
  {
    name: 'teacher-availability-exceptions',
    idPrefix: 'tae',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('teacherId', 'string'),
      createRequiredColumn('startDate', 'string'),
      createRequiredColumn('endDate', 'string'),
      createRequiredColumn('label', 'string-or-null'),
    ],
  },
];

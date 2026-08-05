import type { BackupColumn, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS, NATURAL_KEY_COLUMN } from './backup-columns';

/** Compact column literal — `name` + `type`, non-optional by default. */
function createRequiredColumn(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

/** First half of the registry: people-like + the pricing/scheduling core. */
export const BACKUP_SHEETS_A: readonly BackupSheetSpec[] = [
  {
    name: 'parents',
    idPrefix: 'prt',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      createRequiredColumn('name', 'string'),
      createRequiredColumn('phone', 'string'),
      createRequiredColumn('email', 'string-or-null'),
      createRequiredColumn('relation', 'string'),
      createRequiredColumn('whatsappOptIn', 'boolean'),
    ],
  },
  {
    name: 'students',
    idPrefix: 'stu',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('birthDate', 'string'),
      createRequiredColumn('level', 'string'),
      createRequiredColumn('school', 'string-or-null'),
      createRequiredColumn('notes', 'string-or-null'),
      createRequiredColumn('guardianIds', 'string'),
    ],
  },
  {
    name: 'teachers',
    idPrefix: 'tch',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('cin', 'string-or-null'),
      createRequiredColumn('phone', 'string'),
      createRequiredColumn('email', 'string-or-null'),
      createRequiredColumn('subjectIds', 'string'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
  {
    name: 'rooms',
    idPrefix: 'rom',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('name', 'string'),
      createRequiredColumn('capacity', 'number'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
  {
    name: 'subjects',
    idPrefix: 'sub',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('code', 'string-or-null'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
  {
    name: 'groups',
    idPrefix: 'grp',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('subjectId', 'string'),
      createRequiredColumn('teacherId', 'string-or-null'),
      createRequiredColumn('roomId', 'string'),
      createRequiredColumn('level', 'string'),
      createRequiredColumn('capacity', 'number'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
  {
    name: 'formulas',
    idPrefix: 'fml',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'skip',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('subjectIds', 'string'),
      createRequiredColumn('priceMad', 'number'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('isImmutable', 'boolean'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
];

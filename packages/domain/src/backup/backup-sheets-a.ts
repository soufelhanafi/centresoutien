import type { BackupColumn, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS, NATURAL_KEY_COLUMN } from './backup-columns';

/** Compact column literal — `name` + `type`, non-optional by default. */
function c(name: string, type: BackupColumnType): BackupColumn {
  return { name, type };
}

/** First half of the registry: people-like + the pricing/scheduling core. */
export const BACKUP_SHEETS_A: readonly BackupSheetSpec[] = [
  {
    name: 'parents',
    idPrefix: 'prt',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      c('name', 'string'),
      c('phone', 'string'),
      c('email', 'string-or-null'),
      c('relation', 'string'),
      c('whatsappOptIn', 'boolean'),
    ],
  },
  {
    name: 'students',
    idPrefix: 'stu',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      c('name_fr', 'string'),
      c('name_ar', 'string'),
      c('birthDate', 'string'),
      c('level', 'string'),
      c('school', 'string-or-null'),
      c('notes', 'string-or-null'),
      c('guardianIds', 'string'),
    ],
  },
  {
    name: 'teachers',
    idPrefix: 'tch',
    peopleLike: true,
    naturalKeyColumn: 'naturalKey',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      NATURAL_KEY_COLUMN,
      c('name_fr', 'string'),
      c('name_ar', 'string'),
      c('cin', 'string-or-null'),
      c('phone', 'string'),
      c('email', 'string-or-null'),
      c('subjectIds', 'string'),
      c('active', 'boolean'),
    ],
  },
  {
    name: 'rooms',
    idPrefix: 'rom',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('name', 'string'),
      c('capacity', 'number'),
      c('active', 'boolean'),
    ],
  },
  {
    name: 'subjects',
    idPrefix: 'sub',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('name_fr', 'string'),
      c('name_ar', 'string'),
      c('code', 'string-or-null'),
      c('active', 'boolean'),
    ],
  },
  {
    name: 'groups',
    idPrefix: 'grp',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('subjectId', 'string'),
      c('teacherId', 'string-or-null'),
      c('roomId', 'string'),
      c('level', 'string'),
      c('capacity', 'number'),
      c('kind', 'string'),
      c('active', 'boolean'),
    ],
  },
  {
    name: 'formulas',
    idPrefix: 'fml',
    peopleLike: false,
    naturalKeyColumn: null,
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      c('name_fr', 'string'),
      c('name_ar', 'string'),
      c('subjectIds', 'string'),
      c('priceMad', 'number'),
      c('kind', 'string'),
      c('isImmutable', 'boolean'),
      c('active', 'boolean'),
    ],
  },
];

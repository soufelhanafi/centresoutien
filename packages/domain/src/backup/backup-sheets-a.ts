import type { BackupColumn, BackupColumnReference, BackupColumnType, BackupSheetSpec } from './backup-columns';
import { BACKUP_ENVELOPE_COLUMNS, NATURAL_KEY_COLUMN } from './backup-columns';

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
      referenceColumn('niveauId', 'string-or-null', { sheet: 'niveaux', kind: 'catalog', multiplicity: 'single' }),
      createRequiredColumn('school', 'string-or-null'),
      createRequiredColumn('notes', 'string-or-null'),
      referenceColumn('guardianIds', 'string', { sheet: 'parents', kind: 'catalog', multiplicity: 'list' }),
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
      referenceColumn('subjectIds', 'string', { sheet: 'subjects', kind: 'catalog', multiplicity: 'list' }),
      referenceColumn('niveauIds', 'string', { sheet: 'niveaux', kind: 'catalog', multiplicity: 'list' }),
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
    name: 'niveaux',
    idPrefix: 'niv',
    peopleLike: false,
    naturalKeyColumn: null,
    restoreConflict: 'upsert',
    columns: [
      ...BACKUP_ENVELOPE_COLUMNS,
      createRequiredColumn('name_fr', 'string'),
      createRequiredColumn('name_ar', 'string'),
      createRequiredColumn('code', 'string-or-null'),
      createRequiredColumn('category', 'string'),
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
      referenceColumn('subjectId', 'string', { sheet: 'subjects', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('teacherId', 'string-or-null', { sheet: 'teachers', kind: 'catalog', multiplicity: 'single' }),
      referenceColumn('niveauId', 'string-or-null', { sheet: 'niveaux', kind: 'catalog', multiplicity: 'single' }),
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
      referenceColumn('subjectIds', 'string', { sheet: 'subjects', kind: 'catalog', multiplicity: 'list' }),
      createRequiredColumn('priceMad', 'number'),
      createRequiredColumn('kind', 'string'),
      createRequiredColumn('isImmutable', 'boolean'),
      createRequiredColumn('active', 'boolean'),
    ],
  },
];

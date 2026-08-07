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

/** Sheet configs for the people-like + pricing/scheduling core tables. */
export const SHEET_SQL_A: Readonly<
  Record<'parents' | 'students' | 'teachers' | 'rooms' | 'subjects' | 'groups' | 'formulas', SheetSqlConfig>
> = {
  parents: {
    table: 'parents',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name', 'name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['relation', 'relation'],
      ['whatsappOptIn', 'whatsapp_opt_in'],
    ],
  },
  students: {
    table: 'students',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['birthDate', 'birth_date'],
      ['level', 'level'],
      ['school', 'school'],
      ['notes', 'notes'],
      ['guardianIds', 'guardian_ids'],
    ],
  },
  teachers: {
    table: 'teachers',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['naturalKey', 'natural_key'],
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['cin', 'cin'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['subjectIds', 'subject_ids'],
      ['active', 'active'],
    ],
  },
  rooms: {
    table: 'rooms',
    conflict: 'upsert',
    columns: [...ENVELOPE_COLUMNS, ['name', 'name'], ['capacity', 'capacity'], ['active', 'active']],
  },
  subjects: {
    table: 'subjects',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['code', 'code'],
      ['active', 'active'],
    ],
  },
  groups: {
    table: 'groups',
    conflict: 'upsert',
    columns: [
      ...ENVELOPE_COLUMNS,
      ['subjectId', 'subject_id'],
      ['teacherId', 'teacher_id'],
      ['level', 'level'],
      ['capacity', 'capacity'],
      ['kind', 'kind'],
      ['active', 'active'],
    ],
  },
  formulas: {
    table: 'formulas',
    conflict: 'skip',
    readOnlyColumns: ['isImmutable'],
    columns: [
      ...ENVELOPE_COLUMNS,
      ['name_fr', 'name_fr'],
      ['name_ar', 'name_ar'],
      ['subjectIds', 'subject_ids'],
      ['priceMad', 'price_mad'],
      ['kind', 'kind'],
      ['isImmutable', 'is_immutable'],
      ['active', 'active'],
    ],
  },
};

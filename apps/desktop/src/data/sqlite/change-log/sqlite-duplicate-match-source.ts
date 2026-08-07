import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  DuplicateMatchSource,
  Parent,
  ParentId,
  Student,
  StudentId,
  Teacher,
  TeacherId,
  SubjectId,
  PhoneNumber,
  GuardianRelation,
  UserId,
  DeviceId,
} from '@centresoutien/domain';

const SELECT_PARENTS_BY_PHONE = `
  SELECT id, center_code, device_origin, created_at, updated_at, updated_by,
         deleted_at, version, natural_key, name, phone, email, relation, whatsapp_opt_in
    FROM parents
   WHERE center_code = ? AND phone = ? AND deleted_at IS NULL
`;

const SELECT_TEACHERS_BY_PHONE = `
  SELECT id, center_code, device_origin, created_at, updated_at, updated_by,
         deleted_at, version, natural_key, name_fr, name_ar, phone, email, cin,
         subject_ids, active
    FROM teachers
   WHERE center_code = ? AND phone = ? AND deleted_at IS NULL
`;

const SELECT_STUDENTS_BY_NAME = `
  SELECT id, center_code, device_origin, created_at, updated_at, updated_by,
         deleted_at, version, natural_key, name_fr, name_ar, birth_date, level,
         school, notes, guardian_ids
    FROM students
   WHERE center_code = ? AND deleted_at IS NULL
`;

/**
 * SQLite {@link DuplicateMatchSource} (SOU-91) — the people lookups the
 * sync-time duplicate matcher needs, straight off the center's live tables so a
 * just-pulled record is compared against everything this device already knows.
 * Phone lookups are exact on the E.164-normalized column; the student name
 * lookup pulls every live student of the center and lets the matcher's own name
 * normalization decide (its Arabic→Latin transliteration is the same one the
 * write path stamps, so a device never needs to mirror it here).
 */
export class SqliteDuplicateMatchSource implements DuplicateMatchSource {
  constructor(private readonly db: DB) {}

  findParentsByPhone(centerCode: CenterCode, phone: string): readonly Parent[] {
    const rows = this.db.prepare(SELECT_PARENTS_BY_PHONE).all(centerCode, phone) as ParentRow[];
    return rows.map((row) => ({
      id: row.id as unknown as ParentId,
      centerCode: row.center_code as CenterCode,
      deviceOrigin: row.device_origin as DeviceId,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by as UserId,
      deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
      version: row.version,
      naturalKey: row.natural_key,
      name: row.name,
      phone: row.phone as PhoneNumber,
      email: row.email,
      relation: row.relation as GuardianRelation,
      whatsappOptIn: row.whatsapp_opt_in === 1,
    }));
  }

  findTeachersByPhone(centerCode: CenterCode, phone: string): readonly Teacher[] {
    const rows = this.db.prepare(SELECT_TEACHERS_BY_PHONE).all(centerCode, phone) as TeacherRow[];
    return rows.map((row) => ({
      id: row.id as unknown as TeacherId,
      centerCode: row.center_code as CenterCode,
      deviceOrigin: row.device_origin as DeviceId,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by as UserId,
      deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
      version: row.version,
      naturalKey: row.natural_key,
      name: { fr: row.name_fr, ar: row.name_ar },
      phone: row.phone as PhoneNumber,
      email: row.email,
      cin: row.cin,
      subjectIds: JSON.parse(row.subject_ids) as SubjectId[],
      active: row.active === 1,
    }));
  }

  findStudentsByName(centerCode: CenterCode, _nameKey: string): readonly Student[] {
    // The matcher compares via its own normalizeNameForMatch against every live
    // student's bilingual name — pulling the full live set per name key keeps
    // this adapter free of the transliteration logic (single source, domain-side).
    // `_nameKey` is part of the DuplicateMatchSource contract; the matcher does
    // the name-key filtering itself, so the adapter ignores the value.
    void _nameKey;
    const rows = this.db.prepare(SELECT_STUDENTS_BY_NAME).all(centerCode) as StudentRow[];
    return rows.map((row) => ({
      id: row.id as unknown as StudentId,
      centerCode: row.center_code as CenterCode,
      deviceOrigin: row.device_origin as DeviceId,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by as UserId,
      deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
      version: row.version,
      naturalKey: row.natural_key,
      name: { fr: row.name_fr, ar: row.name_ar },
      birthDate: row.birth_date,
      level: row.level,
      school: row.school,
      notes: row.notes,
      guardianIds: JSON.parse(row.guardian_ids) as ParentId[],
    }));
  }
}

type ParentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  natural_key: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string;
  whatsapp_opt_in: number;
};

type TeacherRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  natural_key: string;
  name_fr: string;
  name_ar: string;
  phone: string;
  email: string | null;
  cin: string | null;
  subject_ids: string;
  active: number;
};

type StudentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  natural_key: string;
  name_fr: string;
  name_ar: string;
  birth_date: string;
  level: string;
  school: string | null;
  notes: string | null;
  guardian_ids: string;
};

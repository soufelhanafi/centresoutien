import type { Database as DB } from 'better-sqlite3';
import type {
  Enrollment,
  EnrollmentId,
  EnrollmentRepository,
  CenterCode,
  DeviceId,
  GroupId,
  StudentId,
  UserId,
} from '@centresoutien/domain';

/** The `enrollments` table row shape as SQLite returns it. */
type EnrollmentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  student_id: string;
  group_id: string;
  start_month: string;
  end_month: string | null;
};

function fromRow(row: EnrollmentRow): Enrollment {
  return {
    id: row.id as EnrollmentId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    studentId: row.student_id as StudentId,
    groupId: row.group_id as GroupId,
    startMonth: row.start_month,
    endMonth: row.end_month,
  };
}

/** Named parameters for the upsert, shared by `save` and `saveIfAbsent`. */
function toParams(enrollment: Enrollment) {
  return {
    id: enrollment.id,
    center_code: enrollment.centerCode,
    device_origin: enrollment.deviceOrigin,
    created_at: enrollment.createdAt.toISOString(),
    updated_at: enrollment.updatedAt.toISOString(),
    updated_by: enrollment.updatedBy,
    deleted_at: enrollment.deletedAt ? enrollment.deletedAt.toISOString() : null,
    version: enrollment.version,
    student_id: enrollment.studentId,
    group_id: enrollment.groupId,
    start_month: enrollment.startMonth,
    end_month: enrollment.endMonth,
  };
}

const SAVE_SQL = `
  INSERT INTO enrollments
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, student_id, group_id, start_month, end_month)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @student_id, @group_id, @start_month, @end_month)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    student_id  = excluded.student_id,
    group_id    = excluded.group_id,
    start_month = excluded.start_month,
    end_month   = excluded.end_month
`;

/**
 * SQLite adapter for {@link EnrollmentRepository}. Pure translation between the port
 * and SQL — no business decisions. Every read hides tombstones (`deleted_at IS NULL`);
 * only the sync feed (`listChangedSince`) sees them. `end_month` is lifecycle
 * metadata and is never consulted by the "active" reads — seat occupancy is governed
 * purely by soft-delete. Identity columns (`id`, `center_code`, `device_origin`,
 * `created_at`) are never rewritten on upsert. Soft-delete only — there is no hard
 * `DELETE`. Mirrors {@link SqliteGroupRepository}.
 */
export class SqliteEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly db: DB) {}

  async save(enrollment: Enrollment): Promise<void> {
    this.db.prepare(SAVE_SQL).run(toParams(enrollment));
  }

  /**
   * Atomic check-then-insert (SOU-126). The seat-existence check and the insert run
   * inside one synchronous better-sqlite3 transaction, so no `await` — and therefore
   * no concurrent enroll — can interleave between them. Returns `false` (no insert)
   * when a live `(studentId, groupId)` already exists; a tombstoned row does not
   * block. This is the last-line duplicate guard behind `EnrollStudent`'s pre-check.
   */
  async saveIfAbsent(enrollment: Enrollment): Promise<boolean> {
    const insertIfAbsent = this.db.transaction((e: Enrollment): boolean => {
      const clash = this.db
        .prepare(
          'SELECT 1 FROM enrollments WHERE student_id = ? AND group_id = ? AND deleted_at IS NULL LIMIT 1',
        )
        .get(e.studentId, e.groupId);
      if (clash !== undefined) return false;
      this.db.prepare(SAVE_SQL).run(toParams(e));
      return true;
    });
    return insertIfAbsent(enrollment);
  }

  async findById(id: EnrollmentId): Promise<Enrollment | null> {
    const row = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ? AND deleted_at IS NULL')
      .get(id) as EnrollmentRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: EnrollmentId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE enrollments SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Enrollment[]> {
    const rows = this.db
      .prepare('SELECT * FROM enrollments WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as EnrollmentRow[];
    return rows.map(fromRow);
  }

  async listActiveByGroup(groupId: GroupId): Promise<readonly Enrollment[]> {
    const rows = this.db
      .prepare('SELECT * FROM enrollments WHERE group_id = ? AND deleted_at IS NULL ORDER BY id')
      .all(groupId) as EnrollmentRow[];
    return rows.map(fromRow);
  }

  async listActiveByStudent(studentId: StudentId): Promise<readonly Enrollment[]> {
    const rows = this.db
      .prepare('SELECT * FROM enrollments WHERE student_id = ? AND deleted_at IS NULL ORDER BY id')
      .all(studentId) as EnrollmentRow[];
    return rows.map(fromRow);
  }

  async countActiveByGroup(groupId: GroupId): Promise<number> {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM enrollments WHERE group_id = ? AND deleted_at IS NULL',
      )
      .get(groupId) as { n: number };
    return row.n;
  }

  async hasActiveEnrollment(studentId: StudentId, groupId: GroupId): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT 1 FROM enrollments WHERE student_id = ? AND group_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .get(studentId, groupId);
    return row !== undefined;
  }
}

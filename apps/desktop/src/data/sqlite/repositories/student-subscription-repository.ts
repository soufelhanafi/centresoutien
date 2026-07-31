import type { Database as DB } from 'better-sqlite3';
import type {
  StudentSubscription,
  StudentSubscriptionId,
  StudentSubscriptionRepository,
  StudentId,
  FormulaId,
  GroupKind,
  SubjectId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `student_subscriptions` table row shape as SQLite returns it. */
type StudentSubscriptionRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  student_id: string;
  formula_id: string;
  kind: string;
  subject_ids: string; // JSON array of subject ULIDs
  start_month: string;
  end_month: string | null;
};

function fromRow(row: StudentSubscriptionRow): StudentSubscription {
  const subjectIds = JSON.parse(row.subject_ids) as string[];
  return {
    id: row.id as StudentSubscriptionId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    studentId: row.student_id as StudentId,
    formulaId: row.formula_id as FormulaId,
    kind: row.kind as GroupKind,
    subjectIds: subjectIds.map((id) => id as SubjectId),
    startMonth: row.start_month,
    endMonth: row.end_month,
  };
}

const SAVE_SQL = `
  INSERT INTO student_subscriptions
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, student_id, formula_id, kind, subject_ids, start_month, end_month)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @student_id, @formula_id, @kind, @subject_ids, @start_month, @end_month)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    formula_id  = excluded.formula_id,
    kind        = excluded.kind,
    subject_ids = excluded.subject_ids,
    start_month = excluded.start_month,
    end_month   = excluded.end_month
`;

/**
 * SQLite adapter for {@link StudentSubscriptionRepository}. Pure translation between
 * the port and SQL — no business decisions (the overlap invariant, coverage, and
 * derived status all live in the domain). Reads hide tombstones; `listChangedSince`
 * (the sync feed) deliberately sees them. Identity columns (`id`, `center_code`,
 * `device_origin`, `created_at`, `student_id`) are never rewritten on upsert. The
 * frozen `subject_ids` snapshot is persisted as a JSON array. Soft-delete only —
 * there is no hard DELETE and no editable status column. Mirrors
 * {@link SqliteGroupRepository}.
 */
export class SqliteStudentSubscriptionRepository implements StudentSubscriptionRepository {
  constructor(private readonly db: DB) {}

  async save(subscription: StudentSubscription): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: subscription.id,
      center_code: subscription.centerCode,
      device_origin: subscription.deviceOrigin,
      created_at: subscription.createdAt.toISOString(),
      updated_at: subscription.updatedAt.toISOString(),
      updated_by: subscription.updatedBy,
      deleted_at: subscription.deletedAt ? subscription.deletedAt.toISOString() : null,
      version: subscription.version,
      student_id: subscription.studentId,
      formula_id: subscription.formulaId,
      kind: subscription.kind,
      subject_ids: JSON.stringify(subscription.subjectIds),
      start_month: subscription.startMonth,
      end_month: subscription.endMonth,
    });
  }

  async findById(id: StudentSubscriptionId): Promise<StudentSubscription | null> {
    const row = this.db
      .prepare('SELECT * FROM student_subscriptions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as StudentSubscriptionRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: StudentSubscriptionId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare(
        'UPDATE student_subscriptions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      )
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly StudentSubscription[]> {
    const rows = this.db
      .prepare('SELECT * FROM student_subscriptions WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as StudentSubscriptionRow[];
    return rows.map(fromRow);
  }

  async listLiveByStudent(studentId: StudentId): Promise<readonly StudentSubscription[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM student_subscriptions WHERE student_id = ? AND deleted_at IS NULL ORDER BY start_month DESC, id',
      )
      .all(studentId) as StudentSubscriptionRow[];
    return rows.map(fromRow);
  }

  async listLiveByStudentAndKind(
    studentId: StudentId,
    kind: GroupKind,
  ): Promise<readonly StudentSubscription[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM student_subscriptions WHERE student_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY start_month DESC, id',
      )
      .all(studentId, kind) as StudentSubscriptionRow[];
    return rows.map(fromRow);
  }
}

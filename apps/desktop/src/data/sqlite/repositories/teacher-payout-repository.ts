import type { Database as DB } from 'better-sqlite3';
import type {
  TeacherPayout,
  TeacherPayoutId,
  TeacherPayoutRepository,
  TeacherPayoutStatus,
  TeacherPayrollRuleKind,
  TeacherId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `teacher_payouts` table row shape as SQLite returns it. */
type TeacherPayoutRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  teacher_id: string;
  month: string;
  rule_kind: string;
  amount_mad: number;
  status: string;
  notes: string | null;
};

function fromRow(row: TeacherPayoutRow): TeacherPayout {
  return {
    id: row.id as TeacherPayoutId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    teacherId: row.teacher_id as TeacherId,
    month: row.month,
    ruleKind: row.rule_kind as TeacherPayrollRuleKind,
    amountMad: row.amount_mad,
    status: row.status as TeacherPayoutStatus,
    notes: row.notes,
  };
}

const SAVE_SQL = `
  INSERT INTO teacher_payouts
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, teacher_id, month, rule_kind, amount_mad, status, notes)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @teacher_id, @month, @rule_kind, @amount_mad, @status, @notes)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    rule_kind   = excluded.rule_kind,
    amount_mad  = excluded.amount_mad,
    status      = excluded.status,
    notes       = excluded.notes
`;

/**
 * SQLite adapter for {@link TeacherPayoutRepository}. Pure translation between the
 * port and SQL — the `(teacherId, month)` idempotency key, the never-touch-a-paid-row
 * rule, and the compute job's amount math all live in `ComputeMonthlyPayrolls`, not
 * here. Reads hide tombstones; `listChangedSince` (the sync feed) deliberately sees
 * them. Soft-delete only — there is no hard DELETE. Mirrors
 * {@link SqliteTeacherPayrollRuleRepository}.
 */
export class SqliteTeacherPayoutRepository implements TeacherPayoutRepository {
  constructor(private readonly db: DB) {}

  async save(payout: TeacherPayout): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: payout.id,
      center_code: payout.centerCode,
      device_origin: payout.deviceOrigin,
      created_at: payout.createdAt.toISOString(),
      updated_at: payout.updatedAt.toISOString(),
      updated_by: payout.updatedBy,
      deleted_at: payout.deletedAt ? payout.deletedAt.toISOString() : null,
      version: payout.version,
      teacher_id: payout.teacherId,
      month: payout.month,
      rule_kind: payout.ruleKind,
      amount_mad: payout.amountMad,
      status: payout.status,
      notes: payout.notes,
    });
  }

  async findById(id: TeacherPayoutId): Promise<TeacherPayout | null> {
    const row = this.db
      .prepare('SELECT * FROM teacher_payouts WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeacherPayoutRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: TeacherPayoutId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE teacher_payouts SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly TeacherPayout[]> {
    const rows = this.db
      .prepare('SELECT * FROM teacher_payouts WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as TeacherPayoutRow[];
    return rows.map(fromRow);
  }

  async findLiveByTeacherMonth(teacherId: TeacherId, month: string): Promise<TeacherPayout | null> {
    const row = this.db
      .prepare(
        'SELECT * FROM teacher_payouts WHERE teacher_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1',
      )
      .get(teacherId, month) as TeacherPayoutRow | undefined;
    return row ? fromRow(row) : null;
  }

  async listLiveByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly TeacherPayout[]> {
    const rows = this.db
      .prepare('SELECT * FROM teacher_payouts WHERE center_code = ? AND month = ? AND deleted_at IS NULL')
      .all(centerCode, month) as TeacherPayoutRow[];
    return rows.map(fromRow);
  }
}

import type { Database as DB } from 'better-sqlite3';
import type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
  TeacherPayrollRuleRepository,
  TeacherId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `teacher_payroll_rules` table row shape as SQLite returns it. */
type TeacherPayrollRuleRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  teacher_id: string;
  kind: string;
  amount_mad: number | null;
  percent: number | null;
  start_month: string;
  end_month: string | null;
};

function fromRow(row: TeacherPayrollRuleRow): TeacherPayrollRule {
  const base = {
    id: row.id as TeacherPayrollRuleId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    teacherId: row.teacher_id as TeacherId,
    startMonth: row.start_month,
    endMonth: row.end_month,
  };
  return row.kind === 'fixed-monthly'
    ? { ...base, kind: 'fixed-monthly', amountMad: row.amount_mad as number }
    : { ...base, kind: 'percentage-of-monthly-fees', percent: row.percent as number };
}

const SAVE_SQL = `
  INSERT INTO teacher_payroll_rules
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, teacher_id, kind, amount_mad, percent, start_month, end_month)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @teacher_id, @kind, @amount_mad, @percent, @start_month, @end_month)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    kind        = excluded.kind,
    amount_mad  = excluded.amount_mad,
    percent     = excluded.percent,
    start_month = excluded.start_month,
    end_month   = excluded.end_month
`;

/**
 * SQLite adapter for {@link TeacherPayrollRuleRepository}. Pure translation between
 * the port and SQL — the at-most-one-active-per-teacher overlap check, the
 * derived-status rule, and the close-and-reopen policy all live in the domain.
 * Reads hide tombstones; `listChangedSince` (the sync feed) deliberately sees
 * them. Identity columns (`id`, `center_code`, `device_origin`, `created_at`,
 * `teacher_id`) are never rewritten on upsert. Soft-delete only — there is no
 * hard DELETE and no editable status column. Mirrors
 * {@link SqliteStudentSubscriptionRepository}.
 */
export class SqliteTeacherPayrollRuleRepository implements TeacherPayrollRuleRepository {
  constructor(private readonly db: DB) {}

  async save(rule: TeacherPayrollRule): Promise<void> {
    this.saveRow(rule);
  }

  private saveRow(rule: TeacherPayrollRule): void {
    this.db.prepare(SAVE_SQL).run({
      id: rule.id,
      center_code: rule.centerCode,
      device_origin: rule.deviceOrigin,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
      updated_by: rule.updatedBy,
      deleted_at: rule.deletedAt ? rule.deletedAt.toISOString() : null,
      version: rule.version,
      teacher_id: rule.teacherId,
      kind: rule.kind,
      amount_mad: rule.kind === 'fixed-monthly' ? rule.amountMad : null,
      percent: rule.kind === 'percentage-of-monthly-fees' ? rule.percent : null,
      start_month: rule.startMonth,
      end_month: rule.endMonth,
    });
  }

  async findById(id: TeacherPayrollRuleId): Promise<TeacherPayrollRule | null> {
    const row = this.db
      .prepare('SELECT * FROM teacher_payroll_rules WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TeacherPayrollRuleRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: TeacherPayrollRuleId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare(
        'UPDATE teacher_payroll_rules SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      )
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly TeacherPayrollRule[]> {
    const rows = this.db
      .prepare('SELECT * FROM teacher_payroll_rules WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as TeacherPayrollRuleRow[];
    return rows.map(fromRow);
  }

  async listLiveByTeacher(teacherId: TeacherId): Promise<readonly TeacherPayrollRule[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM teacher_payroll_rules WHERE teacher_id = ? AND deleted_at IS NULL ORDER BY start_month DESC, id',
      )
      .all(teacherId) as TeacherPayrollRuleRow[];
    return rows.map(fromRow);
  }

  /**
   * SOU-141: persists a close-then-reopen pair so the close can never commit
   * without its replacement. Both writes run inside one `db.transaction` — if
   * `created` violates a constraint (or any write throws), the whole batch rolls
   * back and the incumbent rule stays live. This is the single call a
   * `ReplaceTeacherPayrollRule` issues, replacing the old two-call
   * close→create dance that could orphan a teacher with no live rule.
   */
  async replaceLiveRule(closed: TeacherPayrollRule, created: TeacherPayrollRule): Promise<void> {
    this.db.transaction(() => {
      this.saveRow(closed);
      this.saveRow(created);
    })();
  }
}

import type { Database as DB } from 'better-sqlite3';
import type {
  CenterCode,
  GroupId,
  InvoiceId,
  OverdueInvoiceLineView,
  OverdueInvoiceViewReadPort,
  ParentId,
  StudentId,
} from '@centresoutien/domain';
import { NET_PAID_BY_INVOICE_SQL } from './payment-sql';

/** The `invoices` ⋈ `students` ⋈ `invoice_lines` ⋈ `payments` row shape behind
 *  {@link OverdueInvoiceViewReadPort.listIssuedInvoiceLines}. `student_name_*` /
 *  `guardian_ids` are null when the student row hasn't (yet) synced to this device. */
type OverdueInvoiceQueryRow = {
  invoice_id: string;
  month: string;
  student_id: string;
  student_name_fr: string | null;
  student_name_ar: string | null;
  guardian_ids: string | null;
  total_mad: number;
  net_paid_mad: number;
};

/** Parse the stored JSON guardian array back into branded ParentIds — mirrors
 *  `SqliteStudentRepository`'s own parser (not exported from there). */
function parseGuardianIds(json: string | null): ParentId[] {
  if (json === null) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === 'string') as ParentId[];
}

/**
 * `OverdueInvoiceViewReadPort`'s SQLite implementation (SOU-103) — the Impayés
 * screen's cross-aggregate read, anchored on `invoices` like the rest of
 * `SqliteInvoiceRepository`'s reads. Split into its own file (component-size-limits)
 * from what used to be `SqliteInvoiceRepository`'s own body; `SqliteInvoiceRepository`
 * still structurally implements this port and is the only object composition-root
 * wires up for it — it just delegates the method to an instance of this class over
 * the same `db` handle, so nothing about how the port is consumed changes.
 */
export class SqliteOverdueInvoiceViewReadPort implements OverdueInvoiceViewReadPort {
  constructor(private readonly db: DB) {}

  // Two queries total, never one per invoice, same anti-N+1 shape as
  // `SqliteInvoiceRepository.listInvoices`: the header query LEFT JOINs the student
  // (for its name + guardian_ids) and the two grouped subqueries (line total, net
  // paid); a second batched query then resolves every matched student's live
  // enrolled groups in one round trip.
  async listIssuedInvoiceLines(centerCode: CenterCode): Promise<readonly OverdueInvoiceLineView[]> {
    const rows = this.db
      .prepare(
        `SELECT i.id AS invoice_id, i.month AS month, i.student_id AS student_id,
                s.name_fr AS student_name_fr, s.name_ar AS student_name_ar,
                s.guardian_ids AS guardian_ids,
                COALESCE(lt.total_mad, 0) AS total_mad,
                COALESCE(pt.net_paid_mad, 0) AS net_paid_mad
         FROM invoices i
         LEFT JOIN students s ON s.id = i.student_id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_mad) AS total_mad
           FROM invoice_lines
           WHERE deleted_at IS NULL
           GROUP BY invoice_id
         ) lt ON lt.invoice_id = i.id
         LEFT JOIN (
           ${NET_PAID_BY_INVOICE_SQL}
         ) pt ON pt.invoice_id = i.id
         WHERE i.center_code = ? AND i.deleted_at IS NULL AND i.status = 'issued'
         ORDER BY i.month ASC`,
      )
      .all(centerCode) as OverdueInvoiceQueryRow[];

    if (rows.length === 0) return [];

    const groupIdsByStudent = this.listLiveGroupIdsByStudent(
      centerCode,
      rows.map((row) => row.student_id),
    );

    return rows.map((row) => ({
      invoiceId: row.invoice_id as InvoiceId,
      month: row.month,
      studentId: row.student_id as StudentId,
      studentName:
        row.student_name_fr === null || row.student_name_ar === null
          ? null
          : { fr: row.student_name_fr, ar: row.student_name_ar },
      guardianIds: parseGuardianIds(row.guardian_ids),
      groupIds: groupIdsByStudent.get(row.student_id) ?? [],
      totalMad: row.total_mad,
      netPaidMad: row.net_paid_mad,
    }));
  }

  /** Every live enrollment's group id, batched for `studentIds` in one `IN (...)`
   *  query (mirrors `SqliteEnrollmentRepository.countActiveByGroups`'s anti-N+1
   *  shape) — the groups a student currently attends, for the Impayés group filter. */
  private listLiveGroupIdsByStudent(
    centerCode: CenterCode,
    studentIds: readonly string[],
  ): Map<string, GroupId[]> {
    const groupIdsByStudent = new Map<string, GroupId[]>();
    const uniqueStudentIds = Array.from(new Set(studentIds));
    if (uniqueStudentIds.length === 0) return groupIdsByStudent;

    const placeholders = uniqueStudentIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT student_id, group_id FROM enrollments
         WHERE center_code = ? AND student_id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .all(centerCode, ...uniqueStudentIds) as { student_id: string; group_id: string }[];

    for (const row of rows) {
      const groupId = row.group_id as GroupId;
      const existing = groupIdsByStudent.get(row.student_id);
      if (existing) existing.push(groupId);
      else groupIdsByStudent.set(row.student_id, [groupId]);
    }
    return groupIdsByStudent;
  }
}

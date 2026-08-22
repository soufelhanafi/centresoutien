import type { Database as DB } from 'better-sqlite3';
import type {
  DayCloseActivityReadPort,
  DayCloseActivityCounts,
  DayCloseActivityRange,
  CenterCode,
} from '@centresoutien/domain';

/**
 * SQLite adapter for {@link DayCloseActivityReadPort} (SOU-300) — the non-money
 * activity counts of the day-close report. A pure cross-aggregate read spanning
 * three tables (`student_subscriptions`, `enrollments`, `invoices`), so unlike the
 * single-table repos it owns no write path; it is constructed once in the
 * composition root like any other adapter.
 *
 * Every count is center-scoped and tombstone-hiding (`deleted_at IS NULL`), and
 * sliced by the **UTC envelope day** — `substr(created_at, 1, 10)` for
 * subscriptions/enrollments, `substr(issued_at, 1, 10)` for invoices — within the
 * inclusive `[range.from, range.to]` window. Invoice totals reuse the same
 * `SUM(amount_mad)` line derivation the invoice list already uses; no money math is
 * re-invented here.
 */
export class SqliteDayCloseActivityRepository implements DayCloseActivityReadPort {
  constructor(private readonly db: DB) {}

  async getDayCloseActivity(
    centerCode: CenterCode,
    range: DayCloseActivityRange,
  ): Promise<DayCloseActivityCounts> {
    return {
      newSubscriptions: this.countNewSubscriptions(centerCode, range),
      studentsEnrolled: this.countStudentsEnrolled(centerCode, range),
      invoicesGenerated: this.countInvoicesGenerated(centerCode, range),
    };
  }

  private countNewSubscriptions(
    centerCode: CenterCode,
    range: DayCloseActivityRange,
  ): DayCloseActivityCounts['newSubscriptions'] {
    const rows = this.db
      .prepare(
        `SELECT kind, COUNT(*) AS n
         FROM student_subscriptions
         WHERE center_code = @center_code
           AND deleted_at IS NULL
           AND substr(created_at, 1, 10) BETWEEN @from AND @to
         GROUP BY kind`,
      )
      .all({ center_code: centerCode, from: range.from, to: range.to }) as {
      kind: string;
      n: number;
    }[];

    let regular = 0;
    let examPrep = 0;
    for (const row of rows) {
      if (row.kind === 'exam-prep') examPrep = row.n;
      else if (row.kind === 'regular') regular = row.n;
    }
    return { regular, examPrep, total: regular + examPrep };
  }

  private countStudentsEnrolled(centerCode: CenterCode, range: DayCloseActivityRange): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM enrollments
         WHERE center_code = @center_code
           AND deleted_at IS NULL
           AND substr(created_at, 1, 10) BETWEEN @from AND @to`,
      )
      .get({ center_code: centerCode, from: range.from, to: range.to }) as { n: number };
    return row.n;
  }

  private countInvoicesGenerated(
    centerCode: CenterCode,
    range: DayCloseActivityRange,
  ): DayCloseActivityCounts['invoicesGenerated'] {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(COALESCE(lt.total_mad, 0)), 0) AS total_billed_mad
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_mad) AS total_mad
           FROM invoice_lines
           WHERE deleted_at IS NULL
           GROUP BY invoice_id
         ) lt ON lt.invoice_id = i.id
         WHERE i.center_code = @center_code
           AND i.deleted_at IS NULL
           AND i.status = 'issued'
           AND substr(i.issued_at, 1, 10) BETWEEN @from AND @to`,
      )
      .get({ center_code: centerCode, from: range.from, to: range.to }) as {
      count: number;
      total_billed_mad: number;
    };
    return { count: row.count, totalBilledMad: row.total_billed_mad };
  }
}

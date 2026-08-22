import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import { previousMonth } from '@centresoutien/domain';
import type {
  MultiCenterStatsReadPort,
  MultiCenterStatsRawRow,
} from '@centresoutien/domain';
import { centreDbFileName, openDatabaseAt } from './db';
import { scanInstalledCentreIds, type CenterKeyProvider } from './center-directory';
import { NET_PAID_BY_INVOICE_SQL } from './repositories/payment-sql';

/** Billed + net-paid centimes over `issued` invoices of one month — the exact
 *  `monthlyMoney` convention the single-center dashboard uses, expressed in SQL so
 *  a center's stats row matches its own dashboard. `@month` is `YYYY-MM`. */
const MONTHLY_MONEY_SQL = `
  SELECT
    COALESCE(SUM(lt.total_mad), 0)    AS billed_mad,
    COALESCE(SUM(pt.net_paid_mad), 0) AS collected_mad
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount_mad) AS total_mad
    FROM invoice_lines
    WHERE deleted_at IS NULL
    GROUP BY invoice_id
  ) lt ON lt.invoice_id = i.id
  LEFT JOIN (
    ${NET_PAID_BY_INVOICE_SQL}
  ) pt ON pt.invoice_id = i.id
  WHERE i.deleted_at IS NULL AND i.status = 'issued' AND i.month = @month
`;

const ACTIVE_STUDENT_COUNT_SQL =
  'SELECT COUNT(*) AS n FROM students WHERE deleted_at IS NULL';

const CENTER_PROFILE_SQL =
  "SELECT center_code AS centerCode, name FROM center WHERE deleted_at IS NULL LIMIT 1";

type MoneyRow = { billed_mad: number; collected_mad: number };

/**
 * Reads every installed center's monthly figures for the per-center stats table
 * (SOU-106, Premium `org.multi-center`), implementing {@link MultiCenterStatsReadPort}.
 *
 * **Read-only, one center at a time — the deliberate §5ter exception done safely.**
 * For each `centre-*.db` it opens the file transiently, reads the two money
 * aggregates + the active-student count + the profile row, and closes the handle
 * in `finally` before moving to the next center. No two center DBs are ever open
 * together, nothing is written, and no query spans files — the same isolation
 * `FsCenterDirectory.peek` guarantees, extended from two columns to a handful of
 * aggregates. The active center's DB (already open in the live container) is
 * simply opened a second time read-only; WAL makes the concurrent reader safe, so
 * the hub-like "never special-case one center" rule holds here too.
 *
 * A center whose file will not open (missing, bad key, pre-schema) degrades to a
 * `unavailable: true` row with zeroed figures — never a throw, never a dropped
 * row — matching the SOU-105 precedent.
 */
export class SqliteMultiCenterStatsRead implements MultiCenterStatsReadPort {
  constructor(
    private readonly dir: string,
    private readonly keyFor: CenterKeyProvider,
    private readonly excludeCentreIds: readonly string[] = [],
  ) {}

  async readMonthly(month: string): Promise<readonly MultiCenterStatsRawRow[]> {
    const previous = previousMonth(month);
    return scanInstalledCentreIds(this.dir, this.excludeCentreIds).map((centreId) =>
      this.readCenter(centreId, month, previous),
    );
  }

  private readCenter(centreId: string, month: string, previous: string): MultiCenterStatsRawRow {
    let db: DB | null = null;
    try {
      db = openDatabaseAt(join(this.dir, centreDbFileName(centreId)), this.keyFor(centreId));
      const profile = db.prepare(CENTER_PROFILE_SQL).get() as
        | { centerCode: string; name: string }
        | undefined;
      const current = db.prepare(MONTHLY_MONEY_SQL).get({ month }) as MoneyRow;
      const prior = db.prepare(MONTHLY_MONEY_SQL).get({ month: previous }) as MoneyRow;
      const students = db.prepare(ACTIVE_STUDENT_COUNT_SQL).get() as { n: number };
      const centerCode = profile?.centerCode ?? centreId;
      const name = profile?.name.trim() ?? '';
      return {
        centreId,
        centerCode,
        displayName: name.length > 0 ? name : centerCode,
        billedMad: current.billed_mad,
        collectedMad: current.collected_mad,
        previousCollectedMad: prior.collected_mad,
        studentCount: students.n,
        unavailable: false,
      };
    } catch {
      return {
        centreId,
        centerCode: centreId,
        displayName: centreId,
        billedMad: 0,
        collectedMad: 0,
        previousCollectedMad: 0,
        studentCount: 0,
        unavailable: true,
      };
    } finally {
      db?.close();
    }
  }
}

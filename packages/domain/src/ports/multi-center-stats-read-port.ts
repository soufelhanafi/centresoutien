/**
 * One center's RAW monthly figures as read from its own SQLCipher file (SOU-106).
 * The port returns raw, undivided numbers only — `billedMad`, `collectedMad`,
 * `previousCollectedMad`, `studentCount` — and leaves every derivation (unpaid
 * rate, month-over-month growth, org totals) to the domain, so the rate math is a
 * pure, directly testable function and never a SQL quirk hidden in an adapter.
 *
 * An `unavailable: true` row is a center whose DB could not be opened or read; its
 * numbers are zeroed and must not be treated as real (see the port contract).
 */
export type MultiCenterStatsRawRow = {
  readonly centreId: string;
  readonly centerCode: string;
  readonly displayName: string;
  /** Billed MAD centimes over `issued` invoices of the reporting month. */
  readonly billedMad: number;
  /** Net-paid MAD centimes over `issued` invoices of the reporting month. */
  readonly collectedMad: number;
  /** Net-paid MAD centimes over `issued` invoices of the PREVIOUS month (MoM baseline). */
  readonly previousCollectedMad: number;
  /** Active (non-deleted) students in the center. */
  readonly studentCount: number;
  readonly unavailable: boolean;
};

/**
 * Reads every installed center's monthly figures for the per-center stats table
 * (SOU-106, Premium `org.multi-center`). The desktop adapter enumerates the
 * `centre-*.db` files in the userData dir, opens each one **read-only and
 * transiently** (open → read the aggregates → close), and returns one raw row per
 * center — it never holds two center DBs open together, never writes, and never
 * merges rows across files, preserving the §5ter tenant isolation this feature
 * deliberately reads across (see {@link MultiCenterStatsView}).
 *
 * **Contract — a center DB that will not open degrades, never throws.** A missing
 * file, a wrong key, or a pre-schema DB yields a row with `unavailable: true` and
 * all figures `0`; the read still returns every other center's row. The caller
 * (the use case) has already enforced the Premium plan gate before this is ever
 * invoked — the port does no plan check of its own.
 */
export interface MultiCenterStatsReadPort {
  readMonthly(month: string): Promise<readonly MultiCenterStatsRawRow[]>;
}

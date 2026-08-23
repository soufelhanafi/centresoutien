/**
 * The per-center statistics table for the operator's whole install (SOU-106,
 * Premium `org.multi-center`). This is a **cross-aggregate read model**, not an
 * entity: it is derived at read time by opening each center's own SQLCipher file
 * read-only, computing that center's figures in isolation, and shaping the result
 * here — it is never persisted and carries no sync envelope (there is nothing to
 * sync; each number already lives, versioned, in its own center's DB).
 *
 * **A deliberate, documented exception to CLAUDE.md §5ter.** §5ter reserves
 * cross-center consolidation for the cloud tier. The owner has explicitly chosen
 * to ship a REAL read-only local aggregation on the desktop for this Premium
 * feature. The isolation guarantee that §5ter protects is still honored: each
 * center DB is opened on its own, read, and closed — no two centers ever share a
 * connection, a transaction, a matching key, or a write. The center stays the
 * tenant; this view only *reads across* files, it never *merges* them.
 *
 * **Money convention.** All `*Mad` fields are integer MAD centimes, recognized to
 * the invoice's **billed month**, over `issued` invoices only — identical to
 * {@link DashboardBasicSummary}, so a center's row here matches its own
 * single-center dashboard to the centime. `revenueMad` is billed; `collectedMad`
 * is net paid; the implied unpaid is `revenueMad − collectedMad`.
 *
 * **Derived rates.** `unpaidRate` is `unpaid / revenue` for the reporting month,
 * in `[0, 1]`, `null` when the center billed nothing that month (divide-by-zero).
 * `momGrowthPercent` is the collected-revenue delta vs the previous month, as a
 * percent, `null` when the previous month's collected baseline is 0 — the same
 * null-baseline rule as {@link MoneyDelta}.
 *
 * **Graceful degradation.** A center whose DB cannot be opened (missing file, bad
 * key, pre-schema) is never dropped and never throws: it surfaces as a row with
 * `unavailable: true` and all figures zeroed, so the operator sees "this center
 * could not be read" rather than a silently short table.
 */
export type MultiCenterStatsRow = {
  readonly centreId: string;
  readonly centerCode: string;
  readonly displayName: string;
  /** Billed MAD centimes over `issued` invoices of the reporting month. */
  readonly revenueMad: number;
  /** Net-paid MAD centimes over `issued` invoices of the reporting month. */
  readonly collectedMad: number;
  /** Active (non-deleted) students in the center. */
  readonly studentCount: number;
  /** `(revenueMad − collectedMad) / revenueMad`, `[0,1]`; `null` when revenue is 0. */
  readonly unpaidRate: number | null;
  /** Collected-revenue % delta vs the previous month; `null` when the baseline is 0. */
  readonly momGrowthPercent: number | null;
  /** The center's DB could not be opened/read — figures are zeroed, not real. */
  readonly unavailable: boolean;
};

/** The table header roll-up — the operator's whole-install totals across every
 *  AVAILABLE center (unavailable centers contribute nothing but are still counted
 *  in `centerCount`). `unpaidRate` is the pooled `sum(unpaid) / sum(revenue)`,
 *  `null` when nothing was billed anywhere this month. */
export type MultiCenterStatsTotals = {
  readonly centerCount: number;
  readonly availableCenterCount: number;
  readonly revenueMad: number;
  readonly collectedMad: number;
  readonly studentCount: number;
  readonly unpaidRate: number | null;
};

export type MultiCenterStatsView = {
  readonly month: string; // 'YYYY-MM' of the reporting month (from the Clock)
  readonly rows: readonly MultiCenterStatsRow[];
  readonly totals: MultiCenterStatsTotals;
};

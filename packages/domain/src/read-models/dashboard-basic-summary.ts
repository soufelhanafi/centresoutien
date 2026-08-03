/**
 * The Basique dashboard's three KPI cards (SOU-100, `dashboard.basic` — every
 * plan): today's session count, the live student headcount, and how many of
 * this calendar month's issued invoices are not yet fully paid. This is a
 * **cross-aggregate read model**, not an entity: no sync envelope, never
 * persisted or written back. Produced by {@link GetDashboardBasicSummary}.
 */
export type DashboardBasicSummary = {
  /** Live (non-cancelled) `Session` occurrences dated today, this center. */
  readonly todaysSessionCount: number;
  /** Live (non-tombstoned) students of the center — {@link StudentRepository.countActive}. */
  readonly activeStudentCount: number;
  /**
   * Issued invoices of the current calendar month whose derived
   * {@link PaymentStatus} is not `paid` (i.e. `unpaid` or `partially-paid`).
   * Draft and cancelled invoices never count — a draft owes nothing yet, a
   * cancelled one owes nothing anymore.
   */
  readonly unpaidInvoiceCount: number;
};

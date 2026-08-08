/** How many teachers the "charge enseignants" widget shows, by scheduled minutes desc. */
export const DASHBOARD_TEACHER_LOAD_TOP_N = 8;

/** One money KPI's trend arrow: the percentage move vs the previous month's baseline. */
export type MoneyDelta = {
  /** % change vs previous month, rounded to 1 decimal. null when previous == 0 (no baseline). */
  readonly deltaPercent: number | null;
};

/** The current month's paid-ness roll-up — how many of the month's issued invoices are fully paid. */
export type PaidInvoicesProgress = {
  readonly paidCount: number;
  readonly totalCount: number;
};

/** One Basique money card: the absolute value plus its trend arrow. */
export type ArgentCard = {
  readonly amountMad: number;
  readonly deltaPercent: number | null;
};

/** One group's enrollment bar on the effectifs widget. */
export type GroupEnrollmentBar = {
  readonly groupId: string;
  readonly groupName: { fr: string; ar: string };
  readonly kind: 'regular' | 'exam-prep';
  readonly enrolledCount: number;
  /** Group capacity in MAD-students if the entity has one, else null. */
  readonly capacity: number | null;
};

/** One teacher's scheduled minutes in the current week — a row of the charge widget. */
export type TeacherWeeklyLoad = {
  readonly teacherId: string;
  readonly teacherName: { fr: string; ar: string };
  /** Scheduled minutes this week across all sessions led by this teacher. */
  readonly weeklyMinutes: number;
};

/** A live group with no concrete session materialized in the current week. */
export type GroupWithoutSessions = {
  readonly groupId: string;
  readonly groupName: { fr: string; ar: string };
  readonly kind: 'regular' | 'exam-prep';
};

/**
 * The Basique dashboard's four cards — Argent, Effectifs, Charge enseignants,
 * Séances (SOU-177, `dashboard.basic` — every plan). This is a
 * **cross-aggregate read model**, not an entity: no sync envelope, never
 * persisted or written back. Produced by {@link GetDashboardBasicSummary}.
 *
 * **Money convention.** All `*Mad` fields are integer MAD centimes, recognized
 * to the **billed month** of the invoice (the month string on the `Invoice`),
 * never to the payment date — the same convention as
 * {@link DashboardAdvancedSummary}. `unpaidMad` is `billedMad − collectedMad`
 * over `issued` invoices only: a `draft` owes nothing yet, a `cancelled` one
 * owes nothing anymore (matching `ListInvoices`' own status derivation).
 * `paidInvoices.totalCount` is the number of `issued` invoices, `paidCount`
 * the subset whose derived `PaymentStatus` is `paid`.
 *
 * **Week definition.** `seances.weekStart` is the UTC Monday (ISO week) of
 * `Clock.now()`. `weekSessionCount` counts concrete `Session` occurrences dated
 * in `[weekStart, weekStart+7d)`. `plannedMinutes` is a proxy for "séances
 * planifiées" — the sum of every live `WeeklyRecurringSession`'s duration
 * minutes, regardless of its validity window (no week filtering).
 *
 * **Bounded reads / no new schema.** Every figure is built from repository
 * aggregates that already exist for other screens (`countActive`,
 * `listActive`, `listLiveByCenter`, `listInvoices`, `countActiveByGroups`,
 * `listForRange`, `listRefsForDay`) — no per-student or per-session row loop,
 * no new table, no new migration.
 */
export type DashboardBasicSummary = {
  /** Argent — current calendar month, "recognized to billed month" convention. */
  readonly argent: {
    readonly month: string; // 'YYYY-MM' of the month being reported
    readonly billedMad: number; // sum of totalMad over issued invoices of the month
    readonly collectedMad: number; // sum of netPaidMad over issued invoices of the month
    readonly unpaidMad: number; // billedMad - collectedMad
    readonly paidInvoices: PaidInvoicesProgress; // paid count vs issued count this month
    readonly prevMonth: {
      readonly billedMad: number;
      readonly collectedMad: number;
      readonly unpaidMad: number;
    };
    /** deltas are computed by the use case; percent null when prev baseline is 0 */
    readonly deltas: {
      readonly billed: MoneyDelta;
      readonly collected: MoneyDelta;
      readonly unpaid: MoneyDelta;
    };
  };
  /** Effectifs */
  readonly effectifs: {
    readonly activeStudentCount: number;
    readonly groupCount: number;
    readonly averageStudentsPerGroup: number; // 1 decimal
    readonly unenrolledStudentCount: number; // live students with NO active subscription of either kind this month
    /** sorted by enrolledCount desc; exam-prep groups are flagged via `kind`, not by position */
    readonly groupBars: readonly GroupEnrollmentBar[];
  };
  /** Charge enseignants / semaine — sorted by weeklyMinutes desc, top {@link DASHBOARD_TEACHER_LOAD_TOP_N} only. */
  readonly teacherWeeklyLoad: readonly TeacherWeeklyLoad[];
  /** Séances cette semaine */
  readonly seances: {
    readonly weekStart: string; // 'YYYY-MM-DD' Monday of current week (UTC)
    readonly weekSessionCount: number; // concrete sessions dated within the current week
    readonly plannedMinutes: number; // sum of duration minutes over all live weekly-recurring sessions
    readonly groupsWithoutSessions: readonly GroupWithoutSessions[]; // live groups with no concrete session in the current week
  };
};

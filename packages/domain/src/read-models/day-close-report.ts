import type { DayTakings } from './day-takings';

/**
 * The director's end-of-day "Clôture du jour" report (SOU-300): a read-only
 * snapshot of one business day's activity, generated on demand for any day and
 * printable/exportable as an FR-only PDF. A cross-aggregate read model, not an
 * entity — no sync envelope, never persisted; composed on the fly by
 * {@link GetDayCloseReport} from three existing reads, so it can never disagree
 * with the cash-desk header or the invoice list.
 *
 * `day` is the business day this report covers (`'YYYY-MM-DD'`).
 *
 * `newSubscriptions` counts {@link StudentSubscription} rows created that day,
 * split by `Formula.kind` (`regular` vs `exam-prep`); `total` is their sum.
 * `studentsEnrolled` counts {@link Enrollment} rows created that day. Both count
 * by their **UTC envelope day** (`createdAt` sliced to `YYYY-MM-DD`), unlike the
 * money figures which follow the local-business-day (`paidOn`) boundary — see
 * {@link DayCloseActivityReadPort}.
 *
 * `invoicesGenerated` counts issued invoices whose `issuedAt` falls on the day
 * (UTC envelope day) with `totalBilledMad` the summed billed amount over those.
 *
 * `totalCollectedMad` and `collectedByMethod` are the day's cash figures, taken
 * verbatim from {@link DayTakings} (`netMad` and `byMethod`) so the report and
 * the cash-desk header always agree; all four method keys are always present.
 *
 * `encaissements` is the day's `payment`-kind ledger rows (reversals excluded),
 * each with the payer's student name and the UTC datetime the row was recorded.
 */
export type DayCloseReport = {
  readonly day: string; // 'YYYY-MM-DD'
  readonly newSubscriptions: {
    readonly regular: number;
    readonly examPrep: number;
    readonly total: number;
  };
  readonly studentsEnrolled: number;
  readonly invoicesGenerated: {
    readonly count: number;
    readonly totalBilledMad: number;
  };
  readonly totalCollectedMad: number; // = DayTakings.netMad
  readonly collectedByMethod: DayTakings['byMethod']; // = DayTakings.byMethod, all four keys present
  readonly encaissements: readonly DayCloseEncaissement[];
};

/** One collected payment on the day: payer name, amount, and the ISO datetime recorded. */
export type DayCloseEncaissement = {
  readonly studentName: string;
  readonly amountMad: number;
  readonly at: string; // ISO datetime
};

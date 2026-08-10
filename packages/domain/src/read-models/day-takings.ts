import type { PaymentMethod } from '../entities/payment';

/**
 * The cash-desk header's day total (SOU-198): the **net** money taken on a single
 * calendar day, aggregated in SQL so the figure is independent of any row cap — a
 * center with thousands of payment/reversal rows in one day still totals correctly,
 * unlike a client-side sum over a capped `payment.recent` page.
 *
 * A cross-aggregate read model, not an entity: no sync envelope, never persisted.
 * Produced by {@link RecentPaymentsReadPort.getDayTakings}; `GetDayTakings` gates it.
 *
 * `netMad` is `Σ payments − Σ reversals` in integer centimes over that day's live rows —
 * `0` for a day with no takings, never null; it can go negative on a reversal-heavy day.
 * `paymentCount` counts `kind: 'payment'` rows only (reversals excluded), so the header's
 * "N paiements" label reflects real payments taken, not corrections. `byMethod` carries
 * the same signed net split per method, with **all four method keys always present**
 * (`0` when a method saw no activity) so the header can render a stable breakdown.
 */
export type DayTakings = {
  readonly netMad: number;
  readonly paymentCount: number;
  readonly byMethod: Record<PaymentMethod, number>;
};

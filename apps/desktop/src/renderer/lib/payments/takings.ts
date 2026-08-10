import type { PaymentMethod } from '@centresoutien/domain';
import { PAYMENT_METHODS } from '@centresoutien/domain';
import type { RecentPaymentView } from './recent-payment-view';

/** Today's cash-desk takings, netted (payments minus reversals), split by method. */
export type TakingsSummary = {
  /** Net takings in integer MAD centimes: Σ(payment) − Σ(reversal). */
  readonly netMad: number;
  /** How many payment entries (kind `payment`) were recorded today. */
  readonly paymentCount: number;
  /** Net centimes per method, in the domain's canonical method order. */
  readonly byMethod: readonly { readonly method: PaymentMethod; readonly netMad: number }[];
};

/**
 * Nets a day's ledger rows into a {@link TakingsSummary}. Reversals subtract; the
 * feed decides the netting, the read never filters by kind (SOU-198). Amounts stay
 * integer centimes — formatting happens at the view edge via `formatMoneyMad`.
 */
export function summarizeTakings(payments: readonly RecentPaymentView[]): TakingsSummary {
  const perMethod = new Map<PaymentMethod, number>(PAYMENT_METHODS.map((method) => [method, 0]));
  let netMad = 0;
  let paymentCount = 0;

  for (const payment of payments) {
    const signed = payment.kind === 'reversal' ? -payment.amountMad : payment.amountMad;
    netMad += signed;
    perMethod.set(payment.method, (perMethod.get(payment.method) ?? 0) + signed);
    if (payment.kind === 'payment') paymentCount += 1;
  }

  return {
    netMad,
    paymentCount,
    byMethod: PAYMENT_METHODS.map((method) => ({ method, netMad: perMethod.get(method) ?? 0 })),
  };
}

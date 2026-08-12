import type { Payment, PaymentId } from '../entities/payment';
import type { EntityId } from '../value-objects/ids';

/**
 * The entityType string payments are logged, synced, and projected under — the same
 * key the change-log mapper and the `payments` table use. Named so the resolver can
 * single out reversal collisions without a magic string.
 */
export const PAYMENT_ENTITY_TYPE = 'payments';

/**
 * Two `reversal` rows that void the SAME payment (SOU-233 / audit CS-AUD-002). The
 * in-transaction guard + the per-database partial-unique index stop a second reversal on
 * ONE laptop, but two laptops that each void the same payment offline collide only when
 * their ledgers merge.
 *
 * Deliberately NOT auto-arbitrated away: payments are append-only, so neither reversal is
 * ever hard-deleted. A deterministic winner (the lower ULID, the one every replica
 * converges on) is chosen, and the loser is meant to reach the **duplicates tab** — like
 * a probable double-entry (SOU-91), never a silent hub decision.
 *
 * Two consumers exist today: {@link detectReversalDedups} reports the pair, and
 * {@link netPaidMadDeduped} keeps the derived net correct (each payment reversed once)
 * regardless of how many reversal rows a merge produced. Wiring this into the live
 * sync-apply loop surfaces the loser at pull time while append-only projection keeps
 * hub versions in the shadow sync store, not by updating the payment row.
 */
export type ReversalDedup = {
  readonly entityType: typeof PAYMENT_ENTITY_TYPE;
  /** The payment both reversals target — the natural key they collided on. */
  readonly reversesPaymentId: PaymentId;
  /** The lower-ULID reversal every replica keeps as the effective void. */
  readonly winnerId: PaymentId;
  /** The higher-ULID reversal that must not double-count (kept in the ledger, not deleted). */
  readonly loserId: PaymentId;
};

/** Stable identity for de-duplicating repeated reversal-dedup detections across retries. */
export function reversalDedupKey(dedup: ReversalDedup): string {
  return `reversal-dedup:${dedup.reversesPaymentId}:${dedup.winnerId}:${dedup.loserId}`;
}

export interface PaymentReversalDedupStore {
  findPaymentReversalByTarget(reversesPaymentId: PaymentId, excludeId: EntityId): Payment | null;
}

/**
 * Detect reversal double-voids across a set of live payment rows (typically one
 * invoice's ledger after a merge). Groups `reversal` rows by `reversesPaymentId`; any
 * group with more than one reversal is a collision. The lowest ULID wins (ULIDs sort
 * by creation time, so every replica converges on the same survivor); every other
 * reversal in the group becomes a `loserId` in its own {@link ReversalDedup}.
 *
 * Pure and order-independent — it reads the ledger, decides nothing about the DB, and
 * never mutates. Tombstoned rows are ignored (payments are never tombstoned, but the
 * filter keeps the helper honest if one ever is). Results are sorted by
 * `reversesPaymentId` then `loserId` for stable, testable output.
 */
export function detectReversalDedups(payments: readonly Payment[]): ReversalDedup[] {
  const byTarget = new Map<PaymentId, PaymentId[]>();
  for (const payment of payments) {
    if (payment.deletedAt !== null) continue;
    if (payment.kind !== 'reversal' || payment.reversesPaymentId === null) continue;
    const group = byTarget.get(payment.reversesPaymentId) ?? [];
    group.push(payment.id);
    byTarget.set(payment.reversesPaymentId, group);
  }

  const dedups: ReversalDedup[] = [];
  for (const [reversesPaymentId, reversalIds] of byTarget) {
    if (reversalIds.length < 2) continue;
    const sorted = [...reversalIds].sort((a, b) => a.localeCompare(b));
    const [winnerId, ...losers] = sorted as [PaymentId, ...PaymentId[]];
    for (const loserId of losers) {
      dedups.push({ entityType: PAYMENT_ENTITY_TYPE, reversesPaymentId, winnerId, loserId });
    }
  }

  return dedups.sort(
    (a, b) =>
      a.reversesPaymentId.localeCompare(b.reversesPaymentId) || a.loserId.localeCompare(b.loserId),
  );
}

/**
 * The net paid on an invoice after collapsing reversal double-voids — each payment is
 * reversed at most once no matter how many reversal rows a merge produced. Now an alias
 * of {@link netPaidMad}, which dedups reversals itself (SOU-233), so every derived-net
 * consumer shares one source of truth; the name is kept where the dedup intent reads
 * clearer at the call site (e.g. sync/merge sites reasoning about double-voids).
 */
export { netPaidMad as netPaidMadDeduped } from '../policies/payment-status';

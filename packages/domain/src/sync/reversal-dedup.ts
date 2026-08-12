import type { Payment, PaymentId } from '../entities/payment';

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
 * sync-apply loop (so the loser surfaces at pull time) waits on append-only entities
 * being projectable through sync — the generic projection currently UPSERTs with
 * `DO UPDATE`, which the append-only `payments` triggers forbid.
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
 * The net paid on an invoice **after** collapsing reversal double-voids: each payment
 * is reversed at most once no matter how many reversal rows a merge produced. Mirrors
 * `netPaidMad` but counts only the winning reversal per `reversesPaymentId`, so a
 * post-merge ledger with a duplicate void never drives the net below the single-void
 * result. The winning reversal is the lower ULID — the same survivor
 * {@link detectReversalDedups} reports.
 */
export function netPaidMadDeduped(payments: readonly Payment[]): number {
  const dedups = detectReversalDedups(payments);
  const losers = new Set<PaymentId>(dedups.map((d) => d.loserId));
  return payments.reduce((sum, payment) => {
    if (payment.deletedAt !== null) return sum;
    if (losers.has(payment.id)) return sum;
    return sum + (payment.kind === 'reversal' ? -payment.amountMad : payment.amountMad);
  }, 0);
}

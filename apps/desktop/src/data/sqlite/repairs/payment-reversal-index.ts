import type { Database as DB } from 'better-sqlite3';

/** The partial-unique backstop index name (migration 0042 / SOU-233). */
export const REVERSAL_ONCE_INDEX = 'ux_payments_reversal_once';

/**
 * Bilingual, non-technical copy for the rare legacy case where a center's ledger already
 * holds two live reversals of one payment (a pre-fix double-void, only possible from an
 * offline collision before SOU-233). The repair/duplicates surface shows this — the guard
 * NEVER throws a raw `SqliteError` at DB-open. FR first per app default, then AR.
 */
export const PAYMENT_DOUBLE_VOID_MESSAGE = {
  fr: "Un paiement de ce centre a été annulé deux fois. Les données restent correctes (l'annulation n'est comptée qu'une fois), mais un doublon doit être vérifié dans l'onglet des doublons.",
  ar: 'تم إلغاء دفعة في هذا المركز مرتين. تبقى البيانات صحيحة (يُحتسب الإلغاء مرة واحدة فقط)، لكن يجب مراجعة نسخة مكررة في علامة تبويب التكرارات.',
} as const;

export type PaymentReversalIndexReport = {
  /** True when the unique backstop index is present after this call. */
  readonly uniqueIndexActive: boolean;
  /** Payment ids that carry more than one live reversal (pending double-voids to repair). */
  readonly pendingDoubleVoids: readonly string[];
};

const FIND_DUPLICATE_REVERSALS_SQL = `
  SELECT reverses_payment_id AS id
    FROM payments
   WHERE kind = 'reversal' AND deleted_at IS NULL AND reverses_payment_id IS NOT NULL
   GROUP BY reverses_payment_id
  HAVING COUNT(*) > 1
`;

function uniqueIndexExists(db: DB): boolean {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`)
    .get(REVERSAL_ONCE_INDEX);
  return row !== undefined;
}

function pendingDoubleVoids(db: DB): string[] {
  return (db.prepare(FIND_DUPLICATE_REVERSALS_SQL).all() as { id: string }[]).map((r) => r.id);
}

/**
 * Opportunistically create the `ux_payments_reversal_once` backstop index (SOU-233 /
 * audit CS-AUD-002), NEVER bricking DB-open on a legacy double-void. Migration 0042 only
 * creates the always-safe NON-unique partial index; the unique constraint is added here,
 * every startup, because it is data-conditional and pure `.sql` cannot branch:
 *
 * - Index already present (clean DB migrated earlier) → nothing to do.
 * - No live duplicate reversals → create the unique index (defense-in-depth). Correctness
 *   itself no longer depends on it: the in-transaction guard in
 *   {@link SqlitePaymentLedgerUnitOfWork} and the deduped net derivation
 *   (`SUM_FOR_INVOICE_SQL` / `netPaidMadDeduped`) already guarantee "reversed at most
 *   once".
 * - Live duplicate reversals exist → SKIP the unique index (creating it would abort
 *   DB-open) and RETURN the offending payment ids so the caller can surface them through
 *   the repair/duplicates flow ({@link PAYMENT_DOUBLE_VOID_MESSAGE}), not a raw error.
 *
 * Idempotent and cheap (one metadata lookup + one grouped count), safe to run on every
 * open.
 */
export function ensurePaymentReversalUniqueIndex(db: DB): PaymentReversalIndexReport {
  const duplicates = pendingDoubleVoids(db);

  if (uniqueIndexExists(db)) {
    return { uniqueIndexActive: true, pendingDoubleVoids: duplicates };
  }
  if (duplicates.length > 0) {
    return { uniqueIndexActive: false, pendingDoubleVoids: duplicates };
  }

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${REVERSAL_ONCE_INDEX}
       ON payments(reverses_payment_id) WHERE kind = 'reversal'`,
  );
  return { uniqueIndexActive: true, pendingDoubleVoids: [] };
}

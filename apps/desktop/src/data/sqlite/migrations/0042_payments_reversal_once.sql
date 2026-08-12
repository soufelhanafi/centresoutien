-- 0042_payments_reversal_once.sql
-- What: a NON-UNIQUE partial index on payments(reverses_payment_id) WHERE kind = 'reversal'
--       — the lookup index behind the "reversed at most once" guard.
-- Why:  SOU-233 / audit CS-AUD-002. VoidPayment's "already reversed?" check and its
--       append were separate steps, so two concurrent voids of the same payment could
--       both pass the check and both insert, double-counting the correction and pushing
--       the derived net negative. Correctness is now enforced in two ways that do NOT
--       require a unique constraint: (1) SqlitePaymentLedgerUnitOfWork re-checks
--       in-transaction that no live reversal of the payment exists before appending, and
--       (2) the net derivation (SUM_FOR_INVOICE_SQL / netPaidMadDeduped) collapses
--       reversals to one per reversed payment. This index just makes that in-tx lookup a
--       single indexed probe.
--
--       The UNIQUE defense-in-depth backstop `ux_payments_reversal_once` is created
--       SEPARATELY and DATA-CONDITIONALLY at open by ensurePaymentReversalUniqueIndex()
--       (repairs/payment-reversal-index.ts), NOT here: a legacy double-void (from an
--       offline collision before this guard existed) would make `CREATE UNIQUE INDEX`
--       abort, and pure `.sql` cannot branch on data, so creating the unique index in
--       this migration would brick DB-open. The guard creates it only when the ledger is
--       already clean, skips it and reports the pending double-void bilingually otherwise.
-- First ships in: v2.3.0.
--
-- PARTIAL (WHERE kind = 'reversal') on purpose: `payment` rows carry
-- reverses_payment_id = NULL and are irrelevant to this lookup — only reversals point at
-- a payment. Additive-only: creates one index, no table/column/data change and no
-- backfill; always succeeds regardless of existing data. Sync-neutral: an index touches
-- no row's envelope (created_at/updated_at/version), so it changes nothing that
-- replicates.
--
-- Logical undo: DROP INDEX ix_payments_reversal_target; (per migration-authoring we never
-- ship a drop on a live index — this line documents intent only).

CREATE INDEX ix_payments_reversal_target
  ON payments(reverses_payment_id)
  WHERE kind = 'reversal';

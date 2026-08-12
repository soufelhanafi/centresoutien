-- 0042_payments_reversal_once.sql
-- What: a PARTIAL UNIQUE index on payments(reverses_payment_id) WHERE kind = 'reversal'
--       — at most one live reversal may exist per reversed payment.
-- Why:  SOU-233 / audit CS-AUD-002. VoidPayment's "already reversed?" check and its
--       append were separate steps, so two concurrent voids of the same payment could
--       both pass the check and both insert, double-counting the correction and pushing
--       the derived net negative. This index makes "reversed at most once" a structural
--       DB invariant: the second insert aborts loudly (SQLITE_CONSTRAINT_UNIQUE), which
--       SqlitePaymentLedgerUnitOfWork maps to PaymentAlreadyReversedError. The domain
--       pre-check stays as a fast, friendly path; this is the authoritative guard.
-- First ships in: v2.3.0.
--
-- PARTIAL (WHERE kind = 'reversal') on purpose: `payment` rows carry
-- reverses_payment_id = NULL and must never be constrained — only reversals point at a
-- payment, and each payment may be pointed at once. A plain unique index would also
-- (harmlessly) allow many NULLs, but the partial form states the intent exactly and
-- keeps the index small (one entry per reversal, none per payment).
--
-- Additive-only: creates an index, no table/column/data change and no backfill. It can
-- only be created cleanly if the existing ledger already holds at most one reversal per
-- payment — which the append-only VoidPayment guard has enforced since 0019, so no live
-- DB should carry a pre-existing double-void. (A center that somehow did would surface
-- it here as a create-time failure, the correct loud signal, not silent data loss.)
-- Sync-neutral: an index touches no row's envelope (created_at/updated_at/version), so
-- it changes nothing that replicates. The partial index is per-database, so two devices
-- can still each reverse the same payment offline; that cross-DB collision is settled at
-- merge by the domain's reversal-dedup resolver (packages/domain/src/sync), not here.
--
-- Logical undo: DROP INDEX ux_payments_reversal_once; (per migration-authoring we never
-- ship a drop on a live index — this line documents intent only).

CREATE UNIQUE INDEX ux_payments_reversal_once
  ON payments(reverses_payment_id)
  WHERE kind = 'reversal';

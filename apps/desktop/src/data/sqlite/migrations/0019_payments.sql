-- 0019_payments.sql
-- What: payments — the append-only money ledger for invoices (CLAUDE.md §5 invariant 7,
--       SOU-93). One row per payment or reversal; an invoice's payment status
--       (unpaid | partially-paid | paid) is DERIVED from the sum of these rows, never
--       stored as an editable scalar on the invoice header.
-- Why:  SOU-93. Designs the payment conflict away — append-only rows union at sync with
--       zero same-field clash. Follows 0018_invoices (the invoice header this ledger
--       settles), mirroring the domain-first / adapter+migration-next split.
-- First ships in: v2.0.0.
--
-- Append-only, enforced TWO ways (KICKOFF): (1) no repository method UPDATEs or DELETEs
-- a payment (review rule + the port exposes only `append`), and (2) the BEFORE UPDATE /
-- BEFORE DELETE triggers below RAISE(ABORT) as a safety net. A mistaken payment is
-- corrected by appending a `reversal` row (kind='reversal', reverses_payment_id set),
-- never by editing or deleting — so the ledger stays fully auditable and sync-safe.
--
-- Reversal model: both kinds carry a NON-NEGATIVE amount_mad (CHECK amount_mad >= 0, the
-- money-column convention); the derivation computes net as Σ payments − Σ reversals
-- rather than storing signed amounts. reverses_payment_id is NULL on a payment, set on a
-- reversal.
--
-- Not people-like: a payment is identified by its ledger position, not a matching key, so
-- NO natural_key and NO natural-key index. The envelope's deleted_at exists only for
-- column uniformity — it is NEVER set (deletes are reversals, and the trigger blocks the
-- UPDATE that would set it anyway).
--
-- No FKs (sync-order safe, per 0008/0010/0015/0016/0018): a payment can arrive before its
-- invoice header (or the payment it reverses) during a pull, so those relationships are
-- enforced in the domain, not by the schema. amount_mad is integer MAD centimes
-- (1 MAD = 100). paid_on is a 'YYYY-MM-DD' business date, not a timestamp.
--
-- Additive-only. No backfill (new table). Logical undo is
-- DROP TRIGGER trg_payments_no_delete; DROP TRIGGER trg_payments_no_update; DROP TABLE payments;

CREATE TABLE payments (
  id                  TEXT PRIMARY KEY,             -- ULID with 'pay_' prefix
  center_code         TEXT NOT NULL,
  device_origin       TEXT NOT NULL,
  created_at          TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at          TEXT NOT NULL,
  updated_by          TEXT NOT NULL,                -- user ULID of last editor
  deleted_at          TEXT,                         -- NULL always; deletes are reversals, not tombstones
  version             INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  invoice_id          TEXT NOT NULL,                -- ULID with 'inv_' prefix (no FK, sync-order safe)
  kind                TEXT NOT NULL DEFAULT 'payment', -- 'payment' | 'reversal'
  amount_mad          INTEGER NOT NULL,             -- centimes; >= 0 (reversals subtract in derivation)
  method              TEXT NOT NULL,                -- 'cash' | 'cheque' | 'transfer' | 'other'
  paid_on             TEXT NOT NULL,                -- business date money moved, 'YYYY-MM-DD'
  reverses_payment_id TEXT,                         -- ULID with 'pay_' prefix; NULL on a payment, set on a reversal
  CHECK (id LIKE 'pay\_%' ESCAPE '\'),
  CHECK (kind IN ('payment', 'reversal')),
  CHECK (method IN ('cash', 'cheque', 'transfer', 'other')),
  CHECK (amount_mad >= 0),
  -- A payment never references another; a reversal always does. Keeps the two kinds honest.
  CHECK (
    (kind = 'payment'  AND reverses_payment_id IS NULL) OR
    (kind = 'reversal' AND reverses_payment_id IS NOT NULL)
  )
);

CREATE INDEX ix_payments_updated_at ON payments(updated_at);              -- backs listChangedSince (sync feed)
CREATE INDEX ix_payments_center     ON payments(center_code, deleted_at); -- backs live-rows scans
CREATE INDEX ix_payments_invoice    ON payments(invoice_id);             -- backs listForInvoice / sumForInvoice

-- Append-only safety net (KICKOFF decision 2). The port has no update/delete method, but
-- a trigger makes the invariant structural: any UPDATE or DELETE on a payment row aborts,
-- so a stray query, a future adapter bug, or a hand-edited DB can never mutate the ledger.
-- Corrections are always a new `reversal` row (an INSERT), which these triggers allow.
CREATE TRIGGER trg_payments_no_update
BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments are append-only: UPDATE is forbidden, append a reversal instead');
END;

CREATE TRIGGER trg_payments_no_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments are append-only: DELETE is forbidden, append a reversal instead');
END;

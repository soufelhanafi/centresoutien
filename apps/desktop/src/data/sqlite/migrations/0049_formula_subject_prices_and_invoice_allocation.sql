-- 0049_formula_subject_prices_and_invoice_allocation.sql
-- What: two nullable JSON columns for weighted teacher-fee attribution (SOU-298):
--         * formulas.subject_prices     — the per-subject slice of the bundle price
--         * invoices.subject_allocation — an optional manual per-subject attribution
--                                          override the director pins on one invoice
-- Why:  SOU-298. Attribution used to split a collected line equally across a
--       formula's N subjects; it now splits weighted by the formula's per-subject
--       price map, with an optional per-invoice manual override. Both are one
--       feature (weighted attribution), so they share this file.
-- First ships in: v2.x (next release after 0048).
--
-- Additive-only, both nullable, NO backfill (migration-authoring §3): existing
-- formulas keep subject_prices NULL and existing invoices keep subject_allocation
-- NULL, which the domain reads as "no map" / "no override" and falls back to the
-- original equal split — so replaying this on a laptop that's versions behind
-- changes nothing about its data, and no envelope change-tracking column
-- (updated_at / updated_by / version) is touched, so it produces ZERO phantom sync
-- traffic. A device that already synced its formulas/invoices converges by itself.
--
-- Both columns are OPAQUE JSON text owned by the domain (formula-repository /
-- invoice-repository serialize/parse them); SQLite never interprets them, so there
-- is no new CHECK/index/trigger to add. No new sync MEANING for an existing field
-- either — these are brand-new columns (migration-authoring §5). formulas already
-- carries the immutable-once-billed UPDATE guard trigger (0023); ADD COLUMN is a
-- schema change, not a row UPDATE, so that trigger is never involved here.
--
-- Not synced entity types today (formulas/invoices have no change-log projection
-- mapper), so the domain SCHEMA_VERSION handshake is unchanged.
--
-- Immutability guard, extended (SOU-298): trg_formulas_immutable_guard (0023, narrowed
-- by 0025) lets an immutable formula take exactly one write — flipping active 1->0 with
-- every other billed field unchanged — but it predates subject_prices, so at the SQL
-- level a deactivation could smuggle a change to the new column on a billed formula.
-- Recreate the same-named trigger here, AFTER the ADD COLUMN above, with one extra
-- clause (NEW.subject_prices IS OLD.subject_prices) so subject_prices is frozen exactly
-- like price_mad/subject_ids once the formula has been billed. Same-named trigger
-- redefinition: replay-safe from any prior version, touches no data (migration-authoring
-- §"same-named trigger redefinition").
--
-- Logical undo:
--   (columns are additive and nullable; leave in place — never DROP a shipped column)
--   (trigger: re-run 0025's trg_formulas_immutable_guard body verbatim, i.e. drop the
--    NEW.subject_prices IS OLD.subject_prices clause)

ALTER TABLE formulas ADD COLUMN subject_prices TEXT;      -- JSON [{subjectId,priceMad}], NULL = un-priced (equal split)
ALTER TABLE invoices ADD COLUMN subject_allocation TEXT;  -- JSON [{subjectId,amountMad}], NULL = weighted default

DROP TRIGGER trg_formulas_immutable_guard;

CREATE TRIGGER trg_formulas_immutable_guard
BEFORE UPDATE ON formulas
WHEN OLD.is_immutable = 1
  AND NOT (
    OLD.active = 1
    AND NEW.active = 0
    AND NEW.name_fr = OLD.name_fr
    AND NEW.name_ar = OLD.name_ar
    AND NEW.subject_ids = OLD.subject_ids
    AND NEW.price_mad = OLD.price_mad
    AND NEW.subject_prices IS OLD.subject_prices
    AND NEW.kind = OLD.kind
    AND NEW.deleted_at IS OLD.deleted_at
    AND NEW.is_immutable = OLD.is_immutable
  )
BEGIN
  SELECT RAISE(ABORT, 'formula is immutable: it has been referenced by an invoice line');
END;

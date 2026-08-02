-- 0023_formulas.sql
-- What: formulas table — the priced subject bundle a student subscribes to monthly
--       (CLAUDE.md §7, SOU-60/SOU-61). `invoice_lines.formula_id` (0018) and
--       `student_subscriptions.formula_id` (0017) have been OPAQUE refs waiting on
--       this table since their own migrations shipped; this is that table.
-- Why:  SOU-61. Gives the Formula domain (SOU-60, immutable-once-referenced) its
--       storage, plus the DB-level safety net that makes the immutability barrier
--       structural, not just a domain-layer promise — mirrors 0019_payments'
--       append-only trigger pattern.
-- First ships in: v2.0.0.
--
-- isImmutable (KICKOFF SOU-61): starts 0. Trigger 1 (AFTER INSERT ON invoice_lines)
-- flips it to 1 the first time any invoice line references the formula, atomically
-- within the invoice-line insert's own transaction. Trigger 3 covers the mirror
-- case (below). The domain never sets this column directly —
-- SqliteFormulaRepository.save()'s ON CONFLICT DO UPDATE deliberately excludes
-- is_immutable from its SET clause.
--
-- Trigger 2 (BEFORE UPDATE ON formulas WHEN OLD.is_immutable = 1) aborts ANY update
-- to an immutable formula's row — not just a content-field change. A billed formula
-- is frozen history end to end: it can never be re-saved, deactivated, or even
-- soft-deleted, because it must stay resolvable for historical invoices/reports
-- forever. This backs up the domain-level `FormulaImmutableError` (updateFormula,
-- SOU-60) which already rejects every field patch, including a no-op or an
-- active-only toggle, before the adapter is ever reached. None of the three
-- triggers can collide: trigger 1's and trigger 3's own UPDATEs are each scoped to
-- `is_immutable = 0` rows, which by definition never match trigger 2's
-- `WHEN OLD.is_immutable = 1` guard, so a second flip attempt always no-ops on
-- trigger 1/3 instead of tripping trigger 2's ABORT.
--
-- Trigger 3 (AFTER INSERT ON formulas) closes the out-of-order sync gap trigger 1
-- alone would leave open: this table's own header note (below) says a formula can
-- arrive before OR after the invoice lines that reference it during a pull. If an
-- invoice_lines row synced in first, trigger 1's UPDATE ran against a formula id
-- that didn't exist yet and silently matched zero rows. Without trigger 3, the
-- formula's own row would then insert with is_immutable stuck at its DEFAULT 0
-- forever, even though it has real invoice history elsewhere — undermining the
-- entire point of this migration in exactly the multi-device scenario the app is
-- built around. Trigger 3 re-checks for that already-arrived reference at insert
-- time and flips immutability immediately, symmetric with trigger 1.
--
-- Not people-like: a formula is identified by its relationships, not a matching
-- key, so NO natural_key and NO natural-key index. `active` mirrors
-- `Subject.active` — hides from new-subscription pickers while staying queryable
-- for historical reports; a used (immutable) formula's `active` flag is frozen at
-- whatever it was when it became immutable (deactivating it is a distinct,
-- out-of-scope operation per CLAUDE.md §7's "create a new Formula and deactivate
-- the old one", which never goes through this guarded patch path). Soft-delete
-- only in principle; in practice trigger 2 blocks tombstoning an immutable row.
--
-- subject_ids is a JSON array of 'sub_' ULIDs, same convention as
-- student_subscriptions.subject_ids (0017) — no join table, coverage/attribution
-- policies read the snapshot, never a live join.
--
-- No FKs (sync-order safe, per 0008/0010/0015/0016/0018): a formula can arrive
-- before or after the invoice lines that reference it during a pull, so the
-- relationship is enforced in the domain, not by the schema (and by trigger 3,
-- for this specific immutability field).
--
-- Additive-only. No backfill (new table). Logical undo is
-- DROP TRIGGER trg_formulas_backfill_immutable; DROP TRIGGER trg_formulas_immutable_guard;
-- DROP TRIGGER trg_formulas_flip_immutable; DROP TABLE formulas;

CREATE TABLE formulas (
  id            TEXT PRIMARY KEY,             -- ULID with 'fml_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  name_fr       TEXT NOT NULL,
  name_ar       TEXT NOT NULL,
  subject_ids   TEXT NOT NULL,                -- JSON array of 'sub_' ULIDs
  price_mad     INTEGER NOT NULL,             -- integer MAD centimes; > 0 (a formula always has a real price)
  kind          TEXT NOT NULL,                -- 'regular' | 'exam-prep'
  is_immutable  INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean; SOLE writers are trg_formulas_flip_immutable / trg_formulas_backfill_immutable
  active        INTEGER NOT NULL DEFAULT 1,   -- 0/1 boolean
  CHECK (id LIKE 'fml\_%' ESCAPE '\'),
  CHECK (kind IN ('regular', 'exam-prep')),
  CHECK (is_immutable IN (0, 1)),
  CHECK (active IN (0, 1)),
  CHECK (price_mad > 0)
);

CREATE INDEX ix_formulas_updated_at ON formulas(updated_at);              -- backs listChangedSince (sync feed)
CREATE INDEX ix_formulas_center     ON formulas(center_code, deleted_at); -- backs live-rows scans

-- Trigger 1: the sole writer of is_immutable. Fires once per invoice-line insert;
-- the `AND is_immutable = 0` in the WHERE means a second line referencing an
-- already-immutable formula touches zero rows (no-op), so it can never itself
-- trip trigger 2's guard below.
CREATE TRIGGER trg_formulas_flip_immutable
AFTER INSERT ON invoice_lines
BEGIN
  UPDATE formulas
     SET is_immutable = 1
   WHERE id = NEW.formula_id
     AND is_immutable = 0;
END;

-- Trigger 2: the DB-level safety net backing FormulaImmutableError (SOU-60).
-- Once immutable, no UPDATE at all is allowed on that row — full stop, mirroring
-- 0019_payments' append-only guard. Never fires for trigger 1's own UPDATE above,
-- since that UPDATE only ever touches rows where is_immutable = 0.
CREATE TRIGGER trg_formulas_immutable_guard
BEFORE UPDATE ON formulas
WHEN OLD.is_immutable = 1
BEGIN
  SELECT RAISE(ABORT, 'formula is immutable: it has been referenced by an invoice line');
END;

-- Trigger 3: the mirror of trigger 1 for out-of-order sync arrival — a formula row
-- inserted after invoice lines that already reference it (via a pull) must not
-- land permanently mutable. Scoped to `is_immutable = 0` like trigger 1's UPDATE,
-- so it can never trip trigger 2's guard either.
CREATE TRIGGER trg_formulas_backfill_immutable
AFTER INSERT ON formulas
WHEN EXISTS (SELECT 1 FROM invoice_lines WHERE formula_id = NEW.id)
BEGIN
  UPDATE formulas
     SET is_immutable = 1
   WHERE id = NEW.id
     AND is_immutable = 0;
END;

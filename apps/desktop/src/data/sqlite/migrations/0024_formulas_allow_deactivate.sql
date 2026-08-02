-- 0024_formulas_allow_deactivate.sql
-- What: narrows trg_formulas_immutable_guard (0023) so it allows exactly one
--       write against an immutable formula — flipping `active` from 1 to 0 with
--       every other column unchanged — instead of rejecting every UPDATE.
-- Why:  SOU-62 KICKOFF / the SOU-60 review. CLAUDE.md §7's prescribed move for a
--       price/subject change on a billed formula is "create a new Formula and
--       deactivate the old one" — but 0023's guard (deliberately, per its own
--       header) blocked "ANY update... not just a content-field change", so the
--       "deactivate the old one" half of that sentence had no legal write path.
--       `DeactivateFormula` (packages/domain/src/use-cases/deactivate-formula.ts)
--       is the one caller of this path; it never changes name/subjectIds/priceMad/
--       kind, and the domain still fully blocks a plain `UpdateFormula` on an
--       immutable formula (FormulaImmutableError, unchanged) — this migration only
--       widens what the DB *permits*, not what the domain *offers*.
--
-- The refined guard aborts unless the update is exactly a deactivation: OLD.active
-- was 1, NEW.active is 0, and name_fr/name_ar/subject_ids/price_mad/kind/deleted_at/
-- is_immutable are all unchanged. This still blocks: any content edit, a
-- reactivation (0 -> 1), a soft delete (deleted_at changing), and a redundant
-- re-save of an already-inactive immutable row (OLD.active would already be 0,
-- so the "OLD.active = 1" arm never matches) — `DeactivateFormula` never issues
-- that last one anyway, since it short-circuits before calling save() when
-- nothing changed (`applyWrite`'s changed-fields check).
--
-- Trigger 1 (trg_formulas_flip_immutable) and trigger 3
-- (trg_formulas_backfill_immutable) are untouched — their own UPDATEs only ever
-- flip is_immutable 0 -> 1 on a row where is_immutable is still 0, so they never
-- reach trigger 2's WHEN OLD.is_immutable = 1 guard at all, exactly as before.
--
-- Not additive on a table (no column/table change) — this is a same-named trigger
-- redefinition, safe to replay identically from any prior schema version since it
-- touches no data. Logical undo is re-running 0023's original
-- CREATE TRIGGER trg_formulas_immutable_guard body verbatim.

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
    AND NEW.kind = OLD.kind
    AND NEW.deleted_at IS OLD.deleted_at
    AND NEW.is_immutable = OLD.is_immutable
  )
BEGIN
  SELECT RAISE(ABORT, 'formula is immutable: it has been referenced by an invoice line');
END;

-- 0013_subject_code.sql
-- What: adds the optional `code` column to subjects + a per-center partial unique
--       index enforcing code uniqueness among live subjects.
-- Why:  SOU-45 gives subjects an optional short code (e.g. MATH, PC). Uniqueness
--       is scoped per center and only among non-tombstoned rows, so a code freed
--       by archiving can be reused and separate centers may share a code.
-- First ships in: v2.1.0.
--
-- Additive only: the column is nullable, so pre-existing subjects keep code = NULL
-- (they had no code) with no backfill. Nothing touches updated_at / updated_by /
-- version, so this migration produces zero sync traffic — every replica converges
-- to identical NULLs on its own. The partial index (WHERE code IS NOT NULL) lets
-- any number of subjects have no code while blocking duplicate live codes. Logical
-- undo is DROP INDEX ux_subjects_code; then (SQLite >= 3.35) ALTER TABLE subjects
-- DROP COLUMN code; — trivially reversible.

ALTER TABLE subjects ADD COLUMN code TEXT;   -- NULL when the center assigned no code

CREATE UNIQUE INDEX ux_subjects_code
  ON subjects(center_code, code)
  WHERE code IS NOT NULL AND deleted_at IS NULL;

-- 0041_center_hours_split_day.sql
-- What: migrate base center_hours from a single open/close per weekday to an
--       ordered, non-overlapping JSON window list (SOU-197), the same shape
--       SOU-165 gave center_hours_overrides.hours_by_weekday.
-- Why:  Moroccan centers that work morning + afternoon close for a mid-day lunch
--       break, so one weekday needs two windows (open again after the break).
--       The domain and repository read/write only `windows` after this change;
--       `open`/`close` stay as dead columns (rename dance, migration-authoring
--       §4) so older builds and the Excel backup sheet keep working — they are
--       never read or written by the domain again.
-- First ships in: v2.0.0.
--
-- The backfill is a DETERMINISTIC function of each row's own open/close
-- (migration-authoring §3) — every device derives byte-identical JSON locally,
-- and it NEVER touches updated_at / updated_by / version, so the change feed
-- stays quiet and no phantom sync conflicts can appear. An open row becomes a
-- single window [{open, close}]; a closed row (open IS NULL) becomes [].
-- The window shape + ordering invariants are enforced by the domain schema;
-- SQLite only stores the validated JSON text (precedent: hours_by_weekday in
-- 0040).

ALTER TABLE center_hours ADD COLUMN windows TEXT NOT NULL DEFAULT '[]';

UPDATE center_hours
SET windows = CASE
  WHEN open IS NOT NULL THEN json_array(json_object('open', open, 'close', close))
  ELSE '[]'
END;

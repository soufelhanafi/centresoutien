-- 0051_enrollment_unenrolled_under_teacher.sql
-- What: one nullable column on enrollments — unenrolled_under_teacher_id — the
--       teacher who held the group at the moment the student was unenrolled, plus a
--       partial index backing the teacher-roster "Partis" read.
-- Why:  SOU-301. The teacher roster attributed every tombstoned enrollment in a
--       group to the group's *current* teacher, so reassigning a group A->B moved
--       A's departed students onto B's "Partis" roster + PDF. There is no
--       teacher-assignment history (update-group overwrites Group.teacher_id), so
--       "who taught this student while enrolled" is only knowable if we snapshot it
--       at unenroll time — this column is that snapshot.
-- First ships in: v2.x (next release after 0050).
--
-- Additive-only, nullable, NO backfill (migration-authoring §3): existing
-- enrollments (live and tombstoned) keep unenrolled_under_teacher_id NULL. The
-- domain reads NULL as "no snapshot" and the teacher roster falls back to the
-- group's current teacher for those rows, so replaying this on a laptop that is
-- versions behind changes nothing about its data. No envelope change-tracking
-- column (updated_at / updated_by / version) is touched, so it produces ZERO
-- phantom sync traffic — a device that already synced its enrollments converges by
-- itself.
--
-- No new sync MEANING for an existing field, and no SCHEMA_VERSION bump:
-- enrollments are NOT a synced entity type today (no change-log projection mapper in
-- packages/domain/src/sync), exactly like formulas/invoices in 0049. A brand-new
-- nullable column on a non-projected entity needs no payload upcaster.
--
-- No FK (sync-order safe, matching enrollments' student_id/group_id in 0016): the
-- referenced teacher can arrive after the enrollment on a pull, so the relationship
-- is a hint, not a schema constraint.
--
-- The index is partial (WHERE unenrolled_under_teacher_id IS NOT NULL): only
-- tombstones carry a snapshot, so the index stays tiny and backs
-- listInactiveByFormerTeacher without indexing the NULL of every live enrollment.
--
-- Additive-only. Logical undo is: leave the column in place (never DROP a shipped
-- column); DROP INDEX ix_enrollments_former_teacher.

ALTER TABLE enrollments ADD COLUMN unenrolled_under_teacher_id TEXT;  -- ULID with 'tch_' prefix, NULL until unenrolled (no FK, sync-order safe)

CREATE INDEX ix_enrollments_former_teacher
  ON enrollments(unenrolled_under_teacher_id)
  WHERE unenrolled_under_teacher_id IS NOT NULL;  -- backs listInactiveByFormerTeacher (SOU-301)

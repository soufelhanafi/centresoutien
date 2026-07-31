-- 0017_student_subscriptions.sql
-- What: student_subscriptions table — a student's monthly subscription to a Formula
--       (the priced bundle they pay for). Freezes a snapshot of the formula's kind +
--       subjectIds; status is derived from the month range, never stored.
-- Why:  SOU-63. StudentSubscription domain (close-and-reopen policy) + its persistence.
--       Backs the real StudentSubscriptionReferencePort.activeCoverage adapter that
--       EnrollStudent (SOU-121) consumes.
-- First ships in: v2.0.0.
--
-- NUMBER RECONCILIATION: 0016 is reserved by in-flight SOU-126 (enrollments). If
-- SOU-46/SOU-126 land their migration(s) on main first, renumber this to the next
-- free slot (e.g. 0018) at integration time — a duplicate migration number breaks
-- replay (cf. the SOU-125 0013→0014 collision fix).
--
-- Frozen formula snapshot: formula_id is an OPAQUE ref (no Formula table exists yet,
-- no FK) and kind + subject_ids are captured at creation. subject_ids is a JSON
-- array of 'sub_' ULIDs — coverage is answered from this snapshot alone, never by
-- dereferencing formula_id.
--
-- Derived status: NO status column. "Active for month M" iff
-- start_month <= M AND (end_month IS NULL OR M <= end_month). Closing sets end_month.
-- This mirrors the invoice-status-is-derived rule: no editable status scalar to clash
-- on sync.
--
-- Deliberately NO UNIQUE(student_id, kind): the at-most-one-active-per-kind invariant
-- is enforced in the domain (TooManyActiveSubscriptionsError) so two concurrent
-- creates CONVERGE on sync-resolve instead of the DB rejecting a push (same reasoning
-- as SOU-123/SOU-126). Not people-like: no natural_key, no matching-key index.
--
-- No FKs (sync-order safe, per 0008/0015): a subscription can arrive before the
-- student it points at during a pull, so the relationship is enforced in the domain
-- use case, not by the schema.
--
-- Additive-only. No backfill (new table). Logical undo is DROP TABLE student_subscriptions;

CREATE TABLE student_subscriptions (
  id            TEXT PRIMARY KEY,             -- ULID with 'sbs_' prefix (NOT 'sub_' — that is Subject)
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  student_id    TEXT NOT NULL,                -- ULID 'stu_' prefix (no FK, sync-order safe)
  formula_id    TEXT NOT NULL,                -- OPAQUE ULID 'fml_' prefix (no Formula table/FK)
  kind          TEXT NOT NULL,                -- frozen snapshot: 'regular' | 'exam-prep'
  subject_ids   TEXT NOT NULL,                -- frozen snapshot: JSON array of 'sub_' ULIDs
  start_month   TEXT NOT NULL,                -- 'YYYY-MM' inclusive
  end_month     TEXT,                         -- 'YYYY-MM' inclusive, or NULL when open-ended (live)
  CHECK (id LIKE 'sbs\_%' ESCAPE '\'),
  CHECK (kind IN ('regular', 'exam-prep'))
);

CREATE INDEX ix_student_subscriptions_updated_at ON student_subscriptions(updated_at);
CREATE INDEX ix_student_subscriptions_center     ON student_subscriptions(center_code, deleted_at);
CREATE INDEX ix_student_subscriptions_student    ON student_subscriptions(student_id, deleted_at);

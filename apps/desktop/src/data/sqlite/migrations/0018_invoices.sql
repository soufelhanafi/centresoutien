-- 0018_invoices.sql
-- What: invoices + invoice_lines — the monthly, formula-based invoice (CLAUDE.md §7).
--       One invoice per student per calendar month; one line per active subscription
--       that month. Groups never appear on an invoice; billing is monthly, never
--       per-session or per-group.
-- Why:  SOU-67. Gives the Invoice/InvoiceLine domain (entities + state machine +
--       CreateInvoiceDraft/IssueInvoice/CancelInvoice) its storage, mirroring the
--       0015_groups / 0016_enrollments split (domain first, adapter + migration next).
-- First ships in: v2.0.0.
--
-- Status model (KICKOFF): only the LIFECYCLE is stored — 'draft' | 'issued' |
-- 'cancelled'. Paid-ness is NOT a column: payment status is derived from append-only
-- Payment records (SOU-93), never a stored editable scalar (a same-field sync clash,
-- forbidden). Hence issued_at / cancelled_at but no paid_at, and no total column —
-- the total is derived from the (immutable) lines.
--
-- Lines are their own write-once table, not embedded JSON, so dashboard KPIs and
-- teacher-fee attribution can read/filter them by `kind` at the query level. They
-- carry a FROZEN snapshot (formula ref + bilingual label + amount) so a later Formula
-- change never mutates an already-billed invoice. There is NO invoice_lines UPDATE
-- path in the adapter — inserted once with the draft, read-only thereafter — so lines
-- can never conflict at sync.
--
-- Not people-like: invoices/lines are identified by their relationships, not a
-- matching key, so NO natural_key and NO natural-key index. Soft-delete only.
--
-- ⚠️ NO UNIQUE(student_id, month): one-invoice-per-student-per-month is enforced in
-- the domain (CreateInvoiceDraft + findByStudentMonth), not a DB constraint. Two
-- laptops that generate the same month before a sync must *converge* to one row on
-- sync-resolve — a unique index would instead reject the push and break replication.
-- Same rationale as 0016's missing UNIQUE(student_id, group_id).
--
-- No FKs (sync-order safe, per 0008/0010/0015/0016): an invoice_line can arrive
-- before its invoice header during a pull, so the relationship is enforced in the
-- domain, not by the schema. amount_mad is integer MAD centimes (1 MAD = 100).
--
-- Additive-only. No backfill (new tables). Logical undo is
-- DROP TABLE invoice_lines; DROP TABLE invoices;

CREATE TABLE invoices (
  id            TEXT PRIMARY KEY,             -- ULID with 'inv_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  student_id    TEXT NOT NULL,                -- ULID with 'stu_' prefix (no FK, sync-order safe)
  month         TEXT NOT NULL,                -- inclusive 'YYYY-MM'
  status        TEXT NOT NULL DEFAULT 'draft',-- lifecycle: 'draft' | 'issued' | 'cancelled'
  issued_at     TEXT,                         -- ISO-8601 UTC, set on draft -> issued
  cancelled_at  TEXT,                         -- ISO-8601 UTC, set on -> cancelled
  CHECK (id LIKE 'inv\_%' ESCAPE '\'),
  CHECK (status IN ('draft', 'issued', 'cancelled'))
);

CREATE INDEX ix_invoices_updated_at    ON invoices(updated_at);                    -- backs listChangedSince (sync feed)
CREATE INDEX ix_invoices_center        ON invoices(center_code, deleted_at);       -- backs live-rows scans
CREATE INDEX ix_invoices_student_month ON invoices(student_id, month, deleted_at); -- backs findByStudentMonth

CREATE TABLE invoice_lines (
  id            TEXT PRIMARY KEY,             -- ULID with 'invl_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields (frozen snapshot) --
  invoice_id    TEXT NOT NULL,                -- ULID with 'inv_' prefix (no FK, sync-order safe)
  formula_id    TEXT NOT NULL,                -- formula ref snapshot (soft ref until SOU-60)
  label_fr      TEXT NOT NULL,                -- formula name snapshot (French)
  label_ar      TEXT NOT NULL,                -- formula name snapshot (Arabic)
  kind          TEXT NOT NULL,                -- billed track: 'regular' | 'exam-prep'
  amount_mad    INTEGER NOT NULL,             -- centimes, line total after discount; >= 0
  CHECK (id LIKE 'invl\_%' ESCAPE '\'),
  CHECK (kind IN ('regular', 'exam-prep')),
  CHECK (amount_mad >= 0)
);

CREATE INDEX ix_invoice_lines_updated_at ON invoice_lines(updated_at);              -- backs listLinesChangedSince (sync feed)
CREATE INDEX ix_invoice_lines_center     ON invoice_lines(center_code, deleted_at); -- backs live-rows scans
CREATE INDEX ix_invoice_lines_invoice    ON invoice_lines(invoice_id);             -- backs listLines

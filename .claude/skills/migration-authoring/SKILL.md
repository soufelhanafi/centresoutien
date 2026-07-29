---
name: migration-authoring
description: Author, review, and test SQLite schema migrations for Centre Soutien — additive-only evolution, envelope column templates, index requirements, backfill rules that don't pollute sync, the rename dance, per-center database replay, SQLCipher constraints, and schema-version compatibility between devices and the sync hub. Use this skill whenever a task mentions "migration", "schema", "new table", "add column", "ALTER TABLE", "DROP", "rename", "backfill", "index", "_schema_migrations", or touches apps/desktop/src/data/sqlite/migrations/ or the migration runner. Err on the side of triggering — a bad migration replays on every laptop of every paying center, cannot be recalled, and a subtle one can silently corrupt sync for weeks before anyone notices.
---

# Migration Authoring — Centre Soutien

Migrations here are not like migrations in a normal web app. There is no single production database you can fix at 2 a.m. There are **N encrypted SQLite files per center × M centers × K laptops**, each migrating independently when its app updates, all expected to keep syncing with each other through the hub. Every rule in this skill exists because of that fan-out.

---

## 1. Ground rules (non-negotiable)

1. **Additive only on live tables.** Add columns, add tables, add indexes, backfill. Never `DROP COLUMN`, never `RENAME COLUMN`, never destructive `ALTER` on any table that has ever shipped in a release. (SQLite's limited `ALTER` support makes destructive changes tempting via table-rebuild — resist; rebuilds break in the field on locked/encrypted files.)
2. **Numbered and immutable.** `0001_init.sql`, `0002_parents.sql`, … A migration that has shipped is frozen forever — fixing a shipped migration means writing a *new* one. The runner records applied entries in `_schema_migrations` **per database file**.
3. **Idempotent replay.** The runner may open a center file that is 10 versions behind (a laptop off all summer). The chain must replay cleanly from any released version to head. CI proves this (§6).
4. **One migration = one concern.** Schema for a feature and its backfill may share a file; two unrelated features never do. Bisecting a corrupted center file depends on this.
5. **Runs per center file, inside the SQLCipher session.** Migrations execute after `PRAGMA key`, inside the open encrypted connection. Never copy data through a plaintext temp file, never attach an unencrypted database as a migration aid.
6. **`PRAGMA foreign_keys = ON` is asserted at open, and every new relationship declares its FK.** Migrations that insert rows must order inserts to satisfy FKs — there is no "disable constraints briefly".

---

## 2. New-table template

Every table starts with the envelope, same columns, same order. Copy this and replace the domain fields:

```sql
-- 00XX_<feature>.sql
CREATE TABLE payments (
  id            TEXT PRIMARY KEY,             -- ULID with 'pay_' prefix
  center_code   TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at    TEXT NOT NULL,                -- ISO-8601 UTC (Clock port)
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL,                -- user ULID of last editor
  deleted_at    TEXT,                         -- NULL when alive; soft delete only
  version       INTEGER NOT NULL DEFAULT 0,   -- hub-assigned optimistic-concurrency counter
  -- domain fields --
  invoice_id    TEXT NOT NULL REFERENCES invoices(id),
  amount_mad    INTEGER NOT NULL,             -- centimes; Money VO handles display
  method        TEXT NOT NULL,
  paid_on       TEXT NOT NULL,
  CHECK (id LIKE 'pay\_%' ESCAPE '\')
);

CREATE INDEX ix_payments_updated_at ON payments(updated_at);
CREATE INDEX ix_payments_center     ON payments(center_code, deleted_at);
CREATE INDEX ix_payments_invoice    ON payments(invoice_id);
```

Mandatory for every table: the `updated_at` index and the `(center_code, deleted_at)` index — the sync change feed and every live-rows query scan by them. People-like tables (students, teachers, parents) additionally get:

```sql
CREATE UNIQUE INDEX ux_students_natural_key
  ON students(center_code, natural_key)
  WHERE deleted_at IS NULL;                   -- partial: allows recreate-after-soft-delete
```

Append-only tables (payments, merge log, change feed) get **no UPDATE path at all** — if a repository method updates them, the review rejects it (`sync-safe-entities` invariant 7).

---

## 3. Backfills — the sync trap

This is the subtlety that justifies this skill. A naive backfill (`UPDATE students SET x = …`) that bumps `updated_at` or `version` makes **every row on every laptop look freshly edited**. The next sync then floods the hub with N-thousand phantom changes per device, and the conflict engine sees the same row "edited" on five machines at once — a popup storm of fake conflicts. Never do this.

The rule: **a migration backfill must be a deterministic function of data already in the row or its relations, and it must NOT touch `updated_at`, `updated_by`, or `version`.**

- Deterministic means every device computes byte-identical values locally from the same inputs. Then no sync traffic is needed at all: each replica converges by itself, and identical values can never conflict.
- Example (good): backfilling a new `natural_key` column from existing `center_code + full_name + phone` via the same normalization the domain uses.
- Example (bad): backfilling a `default_teacher_id` by picking "the first group's teacher" — ordering isn't guaranteed identical across devices. Not deterministic → not a migration.
- If the backfill is **not** deterministic, it is a *data change*, not a schema change: ship the column nullable with a domain fallback, and let a domain use case (or the admin) populate it through the normal write path, where `updated_at`/`version` bumps are correct and sync handles it properly.
- New NOT NULL columns on live tables therefore ship as `NOT NULL DEFAULT <value>` or as nullable-with-domain-fallback. Never add a bare NOT NULL column and "fix it in the backfill".

---

## 4. The rename / retype dance

You never rename or drop in place. The sequence, spread over releases:

1. **Release A** — migration adds the new column; deterministic backfill copies/derives values; domain writes **both** columns, reads the new one.
2. **Release B** (once release A is the minimum supported version) — domain stops writing the old column. The column stays, dead, documented in the migration file header.
3. **Major version much later, if ever** — a table-rebuild migration may drop dead columns, only when the release notes declare a hard minimum version and the hub enforces it (§5).

Dead columns are cheap. Field corruption from a botched rebuild on a secretary's laptop is not. Default to leaving them forever.

---

## 5. Schema version vs. the sync hub

Devices update at different times, so schema drift across a center's laptops is normal, and the hub must not become the place where it corrupts data:

- The app writes its **schema version** (highest applied migration) into every push. The hub stores its own.
- **Hub ahead of device** (device is stale): the hub rejects the push with `SchemaTooOldError`; the app shows "mise à jour requise pour synchroniser" and keeps working offline. Pulls of unknown fields are tolerated: the sync payload mapper ignores fields it doesn't know rather than erroring — additive-only evolution makes this safe.
- **Device ahead of hub** (embedded hub laptop is stale): same rejection, other direction — the sync page tells the admin *which machine* needs the update.
- The embedded hub applies migrations to its **canonical store** the same way, from the same files, when its host app updates. One migration chain, three kinds of databases (replica files, embedded canonical store, and later the Postgres translation in `apps/api`).
- Consequence for authors: a migration must never change the **meaning** of an existing synced field (units, encoding, semantics) — old devices would keep pushing the old meaning under the same name. New meaning = new column.

---

## 6. Testing a migration (all four, no exceptions)

1. **Replay from scratch**: fresh file → full chain → schema snapshot matches the expected head schema (checked-in `.sql` dump, diffed in CI).
2. **Replay from every released version**: CI keeps a fixture DB per release (with realistic seeded data, both alive and soft-deleted rows); each must migrate to head cleanly and pass the same snapshot diff.
3. **Constraint proof**: integration tests hit the new constraints on purpose — duplicate `natural_key` insert fails while `deleted_at`-set duplicate succeeds; FK violation fails; CHECK prefix rejects a wrong-prefix id.
4. **Sync-neutrality proof** (if the migration has a backfill): run the migration on two copies of the same fixture, then diff `updated_at`, `updated_by`, `version` across all rows — zero differences allowed — and assert the sync engine computes an **empty** change set between them.

Gate 13 (`pre-merge-check`) runs 1–2; the PR adds 3–4 as integration tests.

---

## 7. Author's checklist

- [ ] File is `00XX_<one-concern>.sql`, immutable once merged; fixes go in a new file.
- [ ] New tables use the envelope template, in order, with `updated_at` + `(center_code, deleted_at)` indexes, FK declarations, and the id-prefix CHECK.
- [ ] People-like tables have the partial unique `natural_key` index.
- [ ] No `DROP`, no `RENAME`, no destructive `ALTER`, no `AUTOINCREMENT`, no plaintext temp files.
- [ ] New NOT NULL columns have a DEFAULT or ship nullable with a domain fallback.
- [ ] Backfill (if any) is deterministic and leaves `updated_at` / `updated_by` / `version` untouched; non-deterministic population goes through a domain use case instead.
- [ ] No semantic change to an existing synced field — new meaning = new column.
- [ ] Payload mappers still ignore unknown fields; schema version bump wired into push metadata.
- [ ] All four tests from §6 exist and pass.
- [ ] Migration file header comments: what, why, and which release first ships it.

---

## 8. Common mistakes

| Mistake | Fix |
|---|---|
| Backfill bumps `updated_at` "to be consistent". | Sync flood + phantom conflicts on every laptop. Backfills never touch envelope change-tracking columns. |
| Non-deterministic backfill ("first matching row"). | Not a migration. Nullable column + domain use case through the normal write path. |
| `ALTER TABLE … RENAME COLUMN` because SQLite allows it. | Old devices keep syncing the old shape. Do the two-release dance (§4). |
| Editing a shipped migration to fix a typo. | The fix ships as a new migration; some center files already applied the old one. |
| Table rebuild copying through an unencrypted temp DB. | Everything stays inside the keyed SQLCipher connection. |
| New NOT NULL column, "backfill will fill it". | The chain must replay on fixtures where the backfill hasn't run yet. DEFAULT or nullable. |
| Reusing an existing column with new units/semantics. | Stale devices push old semantics under the same name. New column. |
| Migration tested only on a fresh DB. | Field reality is a v1-era file with soft-deleted rows. Replay fixtures per release (§6.2). |
| One migration doing two features. | Corrupted-file bisection depends on one-concern files. Split. |

---
name: sync-safe-entities
description: Design entities, IDs, timestamps, and delete semantics so that Centre Soutien can safely synchronize data between two or more laptops (Pro / Premium plans) without duplicating or losing records. Use this skill whenever adding a new entity, adding a new field to an existing entity, writing a new repository method, writing a database migration, adding a delete or bulk update operation, writing Excel import / export logic, or writing sync-conflict resolution. Trigger on phrases like "add an entity", "new table", "migration", "delete", "hard delete", "soft delete", "duplicate", "merge", "sync", "conflict", "natural key", "ULID", "UUID", "device", "tombstone", "last modified", or any change to `packages/domain/src/entities/`, `apps/desktop/src/data/sqlite/migrations/`, or repository files. Err on the side of triggering — sync bugs are irreversible in production and destroy trust.
---

# Sync-Safe Entities — Centre Soutien Desktop

The Pro and Premium plans allow the same center to run the app on **two or more laptops** and keep the data in sync. If IDs collide or deletes are ambiguous, we corrupt data across all copies. This skill exists to make that impossible by construction.

The rules apply on every plan — even Essentiel, which does not sync — because we do not know at write time which plan will be active tomorrow. Consistency is uniform.

---

## The seven invariants

1. **Every entity has a stable, globally unique `id`** generated on the device where it was first created. No auto-increment integers. Ever.
2. **Every entity carries provenance, time, and versioning**: `centerCode`, `createdAt`, `updatedAt`, `updatedBy` (user ULID of last editor), `deletedAt`, `deviceOrigin`, `version` (integer bumped by the hub on every accepted write — the optimistic-concurrency counter; see `sync-hub-protocol`).
3. **People-like entities carry a `naturalKey`** — a *matching key* for duplicate detection, never a hard business constraint. Matching runs parents-first (phone anchor), then students (name + parentId).
4. **Deletes are always soft** — set `deletedAt = now`, never `DELETE FROM`. Rows are tombstones after deletion.
5. **Every write bumps `updatedAt` AND records which fields changed** (per-entity change log). Non-overlapping field changes auto-merge at sync; only same-field clashes reach a human. **Blind wall-clock last-writer-wins is forbidden** — laptop clocks drift, so timestamps inform the conflict UI while `version` decides ordering.
6. **All timestamps are UTC from the injected `Clock` port.** Never `new Date()` in a use case or component; never local time in the DB.
7. **Financial state is append-only.** `Payment` rows are only ever inserted; invoice status is *derived* from the sum of payments. Append-only entities cannot conflict — the only "conflict" is a probable double-entry (same invoice + amount + day), routed to the duplicates tab.

Break any invariant, and you leave a hole a future sync will fall through.

---

## Step 1 — Choose the ID scheme: ULID

Use **ULID** (`ulid` package) for all entity IDs. Reasons:

- 128-bit uniqueness → collision-free across devices.
- Lexicographic sort matches creation time → cheap ordering, cheap sync cursors.
- URL-safe, case-insensitive, 26 chars → readable in logs and Excel.

Wrap in a branded type per entity so a `StudentId` cannot be passed as a `TeacherId`:

```ts
// packages/domain/src/value-objects/ids.ts
type Brand<T, B> = T & { readonly __brand: B };
export type StudentId  = Brand<string, 'StudentId'>;
export type TeacherId  = Brand<string, 'TeacherId'>;
export type RoomId     = Brand<string, 'RoomId'>;
export type GroupId    = Brand<string, 'GroupId'>;
export type ParentId   = Brand<string, 'ParentId'>;
export type SessionId  = Brand<string, 'SessionId'>;
export type InvoiceId  = Brand<string, 'InvoiceId'>;
```

Prefix IDs for eyeball debuggability: `stu_01HW…`, `tch_01HW…`, `prt_01HW…`. The prefix is part of the branded type check.

The `IdGenerator` port lives in the domain and is injected everywhere — never call `ulid()` directly from a use case; call the injected generator so tests can be deterministic.

---

## Step 2 — Every entity has the common envelope

Every domain entity extends the same envelope:

```ts
// packages/domain/src/entities/base.ts
export type EntityEnvelope = {
  readonly centerCode: CenterCode;   // 'CS-CASA-001' — the tenant; never crosses centers
  readonly deviceOrigin: DeviceId;   // 'dev_01HW...' from the machine that first created the row
  readonly createdAt: Date;          // UTC, from the Clock port
  updatedAt: Date;                   // UTC, from the Clock port
  updatedBy: UserId;                 // who last edited — shown in the conflict popup ("PC Accueil / Fatima")
  deletedAt: Date | null;
  version: number;                   // hub-assigned; the optimistic-concurrency counter. 0 until first push.
};
```

Applied concretely:

```ts
export type Student = EntityEnvelope & {
  readonly id: StudentId;
  readonly naturalKey: string;       // see step 3
  fullName: string;
  level: string;
  phone: string;
  parentIds: readonly ParentId[];
  schoolBlocks: readonly WeeklyBlock[];
  // ...
};
```

`readonly` on identity fields (id, createdAt, deviceOrigin, centerCode) makes accidental mutation a type error.

The base envelope is enforced at the migration layer too — see step 6.

---

## Step 3 — People-like entities carry a `naturalKey`

The problem: on Laptop A, the secretary creates "Ahmed Benali, +212 6 00 00 00 00". On Laptop B, before syncing, a different person creates the same student with a slightly different phone format. When sync runs, we have two IDs pointing at the same person.

The mitigation is a **matching hierarchy that runs in dependency order**:

1. **Parents first.** The anchor is the mobile number, normalized to canonical E.164 (`06 12-34-56-78`, `0612345678`, `+212612345678` → `+212612345678`) via the `PhoneNumber` value object. Normalized name + phone match → same parent, merge with high confidence. Shared-phone edge case (an uncle registering two families) → flag in the popup, never auto-merge.
2. **Students second**, once parents are deduplicated. Match on normalized name + `parentId` — the parent is the discriminator that makes name collisions harmless: two "Yassine Alaoui" never have the same father. Fuzzy fallback (same name + same birthdate/grade, *different* parents — e.g. separated families registering the same child under each parent) → flag in the popup.
3. **Dependents last** (enrollments, subscriptions, attendance) — re-pointed by the merge use cases.

Name normalization must handle Moroccan reality: strip diacritics, collapse spacing/hyphens ("El Amrani" / "Elamrani"), and transliterate Arabic to one canonical Latin form so "Mohamed" / "Mohammed" / "محمد" collide.

Confidence tiers everywhere: **exact → auto-merge; partial/fuzzy → conflicts popup; none → keep both.** With the phone anchor, the popup should appear for roughly one family in fifty — rare enough that admins still read it.

The **naturalKey** stamped at creation (`centerCode` + normalized fullName + normalized contact) is the fast exact-match tier of this hierarchy.

```ts
// packages/domain/src/policies/natural-key.ts
export function normalizeNaturalKey(input: {
  centerCode: CenterCode;
  fullName: string;
  contact: string; // email or phone
}): string {
  const name = input.fullName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064a\s]/g, '') // keep latin + arabic
    .replace(/\s+/g, '-')
    .trim();
  const contact = input.contact.replace(/[\s\-()]/g, '').toLowerCase();
  return `${input.centerCode}::${name}::${contact}`;
}
```

Rules:

- `naturalKey` is not the primary key. The `id` is. `naturalKey` is only used to detect probable duplicates during sync.
- Unique index on `(centerCode, naturalKey, deletedAt IS NULL)` at the DB level. This blocks accidental duplicates on the same device and gives sync a fast lookup.
- Changing a student's name or contact does **not** change their `naturalKey`. The key is stamped at creation and never rewritten. If it were mutable, sync merges would be unreliable.
- Entities that carry a naturalKey: `Student`, `Teacher`, `Parent`. Groups, rooms, sessions, invoices do not — they are identified by their relationships.

---

## Step 4 — Delete is always soft

```ts
// domain
async execute(id: StudentId): Promise<void> {
  const now = this.clock.now();
  await this.students.softDelete(id, now);
}

// port
export interface StudentRepository {
  save(s: Student): Promise<void>;
  findById(id: StudentId): Promise<Student | null>;    // returns null if deletedAt is set
  softDelete(id: StudentId, at: Date): Promise<void>;
  findByNaturalKey(nk: string): Promise<Student | null>;
  countActive(centerCode: CenterCode): Promise<number>;
  listAllIncludingDeleted?(cursor?: string): Promise<readonly Student[]>; // sync only
}

// adapter (SQLite)
async softDelete(id: StudentId, at: Date) {
  this.db.prepare('UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(at.toISOString(), at.toISOString(), id);
}
```

**Every** repository query except the sync-specific ones filters `deletedAt IS NULL` in SQL. Grep enforcement: `grep -R "DELETE FROM" apps/desktop/src/data/sqlite` must return nothing except in test fixtures and migration cleanup for tables that never existed in production.

Recreating a soft-deleted person with the same naturalKey is allowed — see the CreateParent example in `clean-architecture` for the pattern. The unique index is partial (`WHERE deleted_at IS NULL`), so it does not block recreation.

---

## Step 5 — Updates bump `updatedAt` — always, exactly once

Every save touches `updatedAt`. The use case sets it; the repository does not silently overwrite:

```ts
// in a use case
const now = this.clock.now();
const next: Student = { ...previous, level: input.level, updatedAt: now };
await this.students.save(next);
```

Do not let the repository stamp `updatedAt` inside the SQL. The use case must be the source of the value so tests can be deterministic and so sync deltas are correct.

Bulk updates set `updatedAt` per row in a transaction, not for all rows at the same instant unless they truly changed at the same instant (a bulk import).

---

## Step 6 — Migration layout

Every table starts with the envelope columns in the same order. Copy this template.

```sql
-- apps/desktop/src/data/sqlite/migrations/0001_init.sql
CREATE TABLE students (
  id TEXT PRIMARY KEY,                          -- ulid, with 'stu_' prefix
  center_code TEXT NOT NULL,
  device_origin TEXT NOT NULL,
  created_at TEXT NOT NULL,                     -- ISO-8601 UTC
  updated_at TEXT NOT NULL,
  deleted_at TEXT,                              -- NULL when alive
  natural_key TEXT NOT NULL,
  full_name TEXT NOT NULL,
  level TEXT NOT NULL,
  phone TEXT NOT NULL,
  -- ...domain-specific fields...
  CHECK (id LIKE 'stu\_%' ESCAPE '\')
);

CREATE UNIQUE INDEX ux_students_natural_key
  ON students(center_code, natural_key)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_students_updated_at ON students(updated_at);
CREATE INDEX ix_students_center ON students(center_code, deleted_at);
```

Rules for migrations:

- Numbered `0001_`, `0002_`, ... — the migration runner runs them in order and records applied migrations in a `_schema_migrations` table.
- **Additive only** on live tables: add columns, add indexes, backfill data. Never `DROP COLUMN` a column that has ever been in production. Renames are done via add + backfill + code-deprecate + remove-in-later-major.
- Every table gets `updated_at` and `deleted_at` indexes because sync scans by them.
- Foreign keys are declared and enforced (`PRAGMA foreign_keys = ON;` at DB open).

---

## Step 7 — Excel import / export must preserve identity

The Excel format doubles as backup, sync-via-Excel (Pro), and bulk data entry. It must round-trip identity:

- Every export includes the `id`, `updated_at`, `deleted_at`, `natural_key`, `device_origin`, `center_code` columns for every entity.
- The template for bulk entry omits `id` (a fresh ULID is generated on import) but includes `natural_key` as an optional column — if a matching natural key exists, the row is treated as an update.
- On import, the flow is `preview_import → user reviews → apply_import`. The preview:
  - Groups rows by `created / updated / skipped-duplicate / skipped-invalid`.
  - Shows per-row validation errors from Zod schemas.
  - Never mutates the DB.
- `apply_import` runs in a single transaction. On any error, roll back the whole file.

For **Excel sync** specifically (Pro plan without cloud):

- Each device writes an export named `centresoutien-{centerCode}-{deviceOrigin}-{ISOTimestamp}.xlsx`.
- Import from another device runs the same preview flow but with sync-aware conflict handling:
  - Same `id` on both sides → field-level merge for non-overlapping changes; conflict popup for same-field clashes (see `sync-hub-protocol` — never blind last-`updated_at`-wins).
  - Different `id` but same `naturalKey` → prompt to merge, keep one id, retire the other (`deletedAt` set on the loser, and links updated to point at the winner via a merge log — see step 8).

---

## Step 8 — Merges leave a trail

When two records merge (via sync duplicate detection or manual admin action):

- Winner keeps its `id`, absorbs any missing fields from the loser.
- Loser gets `deletedAt = now` and a `mergedIntoId = winner.id` field.
- All references (enrollments, invoice lines, sessions) that pointed at the loser are updated to point at the winner in the same transaction.
- A merge log entry is written to `_merges` for audit and undo.

Merges are always executed by a domain use case — `MergeParents`, `MergeStudents` in `packages/domain/src/use-cases/` — never inline in the sync adapter or the hub. Re-pointing enrollments, subscriptions, invoices, and attendance from loser to winner is the hard part; it lives in the use case, in one transaction, so desktop and future web share one merge engine.

---

## Step 9 — Adding a new entity — the checklist

Before writing the migration, tick these:

- [ ] Entity has ULID-based branded `id`.
- [ ] Entity extends `EntityEnvelope` (centerCode, deviceOrigin, createdAt, updatedAt, updatedBy, deletedAt, version).
- [ ] If people-like, has `naturalKey` and the corresponding unique partial index.
- [ ] Repository port has `save`, `findById` (filters deletedAt), `softDelete`, and any needed queries. Never `hardDelete`.
- [ ] Repository port has `listChangedSince(cursor)` for sync (can be added later, but the shape is compatible).
- [ ] Writes record changed field names for the per-entity change log (auto-merge depends on it).
- [ ] If the entity is financial, it is append-only with derived aggregates (like `Payment` → invoice status), never a mutable status scalar.
- [ ] Zod schema in `packages/domain/src/entities/` matches TypeScript type, used at all boundaries.
- [ ] Migration file is additive, indexes on `updated_at` and `deleted_at`, foreign keys declared.
- [ ] Excel export/import mapping updated (or explicitly deferred with a ticket).
- [ ] Unit tests cover: create, update (bumps updatedAt), softDelete (findById returns null), recreate-after-softDelete permitted for people-like entities.
- [ ] Integration tests hit the SQL constraints (unique partial index, foreign keys) to prove the DB enforces them.

---

## Step 10 — Common mistakes and their fix

| Mistake | Fix |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` in a migration. | Replace with `TEXT PRIMARY KEY` populated by ULID from the domain. |
| `DELETE FROM students WHERE …` in a repository. | Replace with `UPDATE … SET deleted_at = ?`. |
| A query without `WHERE deleted_at IS NULL`. | Add it, unless you are the sync engine (which should be explicitly named). |
| `updated_at` set inside SQL (`updated_at = CURRENT_TIMESTAMP`). | Move to the use case so tests can inject a `Clock`. |
| A `naturalKey` computed at read time. | Compute at create time only. It must be immutable. |
| `naturalKey` includes fields the user can edit later (`school`, `level`). | Base it only on `centerCode + fullName + email|phone`. Nothing else. |
| A relationship column that references a deleted row. | Adjust the merge / delete flow to rewrite references. Do not orphan. |
| A migration renames or drops a live column. | Rewrite as add-new + backfill + code-migrate + drop-in-major. |
| An import that mutates the DB even when preview shows errors. | Preview must be pure. `apply_import` is one transaction; rollback on any failure. |
| Sync merges executed inside the SQLite adapter. | Move merges into a domain use case (`MergeParents`, `MergeStudents`) that the sync layer calls. |
| Conflict auto-resolved by comparing `updated_at`. | Timestamps inform the popup; `version` + the hub's push check decide ordering. Human confirms same-field clashes. |
| Student dedup attempted before parent dedup. | Dependency order: parents (phone E.164) → students (name + parentId) → dependents. |
| Phone stored as raw user input. | Normalize to E.164 in the `PhoneNumber` value object at the boundary; store canonical form. |
| Invoice `status` column written directly. | Insert a `Payment` row; derive status from the sum. |
| A query or key that spans two `centerCode`s. | Center = tenant. One DB file per center on desktop; tenant scoping in Postgres later. |

Everything about sync becomes tractable when these invariants are held. Break one and the surface area of bugs explodes.

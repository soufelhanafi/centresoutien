# ADR 0002 — change_log payload is a versioned domain entity, never a physical row

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Reviewer suggestion on [SOU-79](https://linear.app/soufelhanafi/issue/SOU-79)
- **Linear:** [SOU-170](https://linear.app/soufelhanafi/issue/SOU-170) (parent epic [SOU-13 — Sync](https://linear.app/soufelhanafi/issue/SOU-13))
- **Related:** [ADR 0001 — hub-and-spoke](0001-sync-hub-and-spoke.md), `sync-hub-protocol` skill

## Context

Every repository write appends one row to the append-only `change_log`, carrying
a full snapshot of the write as `payload` JSON. The log is the causal record
that rebuilds a database on replay and, from [SOU-80](https://linear.app/soufelhanafi/issue/SOU-80)
onward, the feed devices sync-apply against the hub.

The first writer implementation snapshotted the just-written row via
`SELECT *` — the **physical SQLite row** (snake_case columns). That is
self-consistent today but fails on both horizons that matter:

1. **Schema evolution.** A later migration that renames, drops, or re-types a
   column makes every older log row unplayable: the payload carries the old
   column names, and replay upserts them blindly.
2. **Cross-device sync-apply.** A payload authored on a device at schema vN
   cannot be upserted on a device at vM. The physical row is a per-device
   implementation detail; it must never cross devices.

ADR 0001 records that the change-log payload becoming the sync-apply surface
"must be schema-version-tolerant across devices" and defers the versioning
decision to this ADR, which must land before SOU-80 builds its apply path.

## Decision

**The `change_log.payload` is a versioned serialization of the DOMAIN entity —
the portable contract — never the physical row.**

Concretely:

- **Payload envelope.** Each payload is `{ "version": N, "entity": { … } }`.
  `version` is the entity-shape version the payload was written at; `entity` is
  the domain shape (camelCase, domain types: booleans as booleans, dates as ISO
  strings, bilingual fields nested). The envelope lives in
  `packages/domain/src/sync/change-log-payload.ts`.
- **The writer serializes the domain entity.** Repositories hand
  `ChangeLogWriter.record` the exact domain entity they persisted (the
  tombstoned shape for a soft delete). The writer no longer reads the row back
  from SQL. No `SELECT *`, no physical-row snapshot.
- **Replay/apply map domain → current physical row.** A per-entityType mapper
  (`change-log-entity-mappers.ts`) converts the deserialized domain entity onto
  the device's _current_ schema at apply time. A column rename is handled by
  updating the mapper — old payloads are untouched because they never name
  columns. Additive migrations need no mapper change at all.
- **Upcasting seam.** `deserializeChangeLogPayload` runs an ordered upcaster
  chain for payloads older than the newest version the device knows
  (`1 … upcasters.length + 1`). A payload whose version has no registered
  upcaster is refused, not applied blind. There are zero upcasters today (v1
  identity); the seam is the documented place a future entity-shape change is
  absorbed.
- **One canonical shape per entityType.** The backup-restore path (SOU-44) logs
  the same canonical shapes: its flat logical rows for sheets with no
  repository writer yet, and the converted domain `Subject` for `subjects`
  (whose repository also writes it). When a later ticket wires another
  repository to the log, that ticket registers its domain mapper and, if needed,
  an upcaster for the transitional flat payloads.

## Alternatives considered

### Keep the physical row, add a schema version

Tag the physical row payload with a schema version and upcast column names at
replay/apply. **Rejected:** the receiving device would have to interpret another
device's physical schema (which columns exist, their names, their types) — the
physical layout leaks across devices, and every migration would need a
column-rename upcaster for every affected entity. It preserves the coupling the
ticket exists to remove.

### Store the domain entity, no version

Serialize the domain entity without a version tag. **Rejected:** when a domain
shape evolves (a field renames, a scalar becomes a nested object), there is no
way to tell an old payload from a new one, so nothing can be upcast. The version
is what makes future shape changes safe.

## Consequences

**Positive**

- Replay and future sync-apply are stable across schema migrations and device
  version skew: the domain shape is the single contract every device speaks.
- Physical column renames/drops are a local mapper update, invisible to the log
  and to other devices.
- The upcaster seam has a unit-tested home before any shape ever changes.

**Negative / trade-offs**

- The writer needs the domain entity at record time. `softDelete` paths must
  construct the tombstoned domain entity (load row → map → set tombstone)
  instead of the writer reading the row back — one extra read on the delete
  path.
- Backup sheets without a repository writer log their flat logical shape today;
  those payloads are versioned and replayable, and converting them to full
  domain entities happens per-entity as each sync ticket lands.

## Downstream

- [SOU-80](https://linear.app/soufelhanafi/issue/SOU-80) — sync-apply reads this
  payload; entities it wires get a registered domain mapper + any upcaster.
- [SOU-122](https://linear.app/soufelhanafi/issue/SOU-122) — subject code
  collision on sync-apply (routes to conflict, never a raw constraint throw).

# ADR 0001 — Synchronization model: hub-and-spoke

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Architecture review (July 2026)
- **Linear:** [SOU-77](https://linear.app/soufelhanafi/issue/SOU-77) (parent epic [SOU-13 — Sync](https://linear.app/soufelhanafi/issue/SOU-13))
- **Related skill:** `.claude/skills/sync-hub-protocol`

## Context

Centre Soutien is offline-first. On the Pro and Premium plans a single center
runs the app on two or more laptops over the center's local network, and each
laptop must keep working with no connectivity. The data those laptops edit —
students, parents, teachers, groups, sessions, invoices, payments — is the same
per-center dataset, so their edits must eventually converge to one identical
state without losing or duplicating records.

Two constraints shape every option:

1. **No always-on server on the desk.** v2 ships to centers that have laptops and
   a WiFi router, nothing else. Any design that assumes a permanent central
   server on the LAN is a non-starter for the offline tier.
2. **The same design must extend to the cloud unchanged.** The Pro/Premium cloud
   tier — which doubles as the future web SaaS backend (`apps/api`) — has to reuse
   the exact same synchronization contract, not a second parallel implementation.
   A model that only works on the LAN forfeits that reuse.

The invariants the domain already commits to (see CLAUDE.md §5 and the
`sync-safe-entities` skill) also constrain the choice: ULID identifiers, a full
envelope with a hub-assigned `version` counter, soft-delete tombstones, a
per-field change log, and append-only payments. Whatever model we pick must let
those primitives do their job — in particular, ordering must be decided by the
`version` counter and a per-device monotonic sequence, **never by wall-clock
timestamps**, because laptop clocks drift.

## Decision

**Synchronization is hub-and-spoke, never peer-to-peer.**

The **hub is a role, not a machine.** It is the single holder of the *canonical*
version of a center's data, and it is deliberately dumb. It does exactly four
things:

1. Store canonical state with a `version` counter per row.
2. Serve deltas by cursor — "everything changed since cursor X".
3. Accept pushes guarded by an optimistic-concurrency check on `baseVersions`.
4. Track one cursor per `(deviceId, centreId)`.

**The hub contains no business logic and no conflict resolution.** It is a
versioned mailbox. All resolution — field-level auto-merge, duplicate matching,
delete-vs-edit handling — happens on the laptops, in `packages/domain/src/sync`.

### One port, two adapters

The hub is reached only through `SyncHubPort`
(`packages/domain/src/ports/sync-hub-port.ts`):
`pullChanges(centreId, cursor)`, `pushChanges(centreId, batch, baseVersions)`,
`getCursor(deviceId, centreId)`.

- **v2 — embedded LAN hub.** A small Node HTTP listener inside the Electron main
  process of one designated laptop (`apps/desktop/src/main/hub-server`), with its
  own canonical SQLite store. Other laptops sync to it over the center's WiFi.
  The hub laptop is **not special-cased**: its own local replica syncs to its own
  embedded hub over localhost, through the same `SyncHubPort` as every other
  device.
- **Later — cloud hub.** `apps/api` exposes the same port as authenticated HTTP
  routes over tenant-scoped Postgres. Upgrading a center from LAN to cloud is a
  configuration change, not a habit change, and the same service is the web SaaS
  backend.

### The sync cycle: pull → resolve → push

Always in that order, every sync:

1. **Pull** everything the hub has changed since this device's cursor.
2. **Resolve** locally. Non-overlapping field changes auto-merge silently; only
   same-field clashes, duplicates, and delete-vs-edit reach the conflict popup.
   Resolution always happens on the device that syncs **second** — every other
   device simply receives the outcome on its next pull, so teammates never need
   to coordinate.
3. **Push** with `baseVersions`. If the hub has moved past any base version
   (someone pushed in between), the push is rejected as stale and the device
   re-runs the whole cycle. One cheap capped retry loop serializes concurrent
   syncs without any locks.

### Tenancy and addressing

Every sync scope is per `(deviceId, centreId)`. The center is the tenant; one
encrypted SQLCipher DB file per center; cursors, matching keys, and canonical
state never cross a `centreId` boundary. Multi-center consolidation is a separate
cloud-only concern and does not touch this model.

## Alternatives considered

### Leader / follower (primary-replica)
One laptop is the writable primary; others are read replicas that forward writes
to it. **Rejected:** it breaks offline-first — a follower cannot accept writes
while the primary is unreachable, which is exactly the WiFi-flaky, laptop-asleep
reality of a Moroccan center. It also hard-codes a special machine, which we
explicitly refuse.

### Multi-master peer-to-peer with vector clocks (CRDT-style)
Every laptop syncs directly with every other; causality tracked by vector clocks
or a CRDT. **Rejected:** N-device P2P turns every new laptop into a new pairwise
relationship (an N² connectivity and reconciliation problem), needs all peers
reachable at once, and pushes genuine business conflicts (two people editing the
same student's phone) into automatic CRDT merges that silently pick a winner —
unacceptable for money and personal data. With a hub, 5 laptops is the same
problem as 2: each device only ever converses with canonical state.

### Wall-clock last-writer-wins
Resolve every conflict by keeping the row with the newest timestamp. **Rejected
outright:** laptop clocks drift and are user-settable, so LWW silently destroys
real edits when a device's clock is ahead. Timestamps in this system are
*information for the human* in the conflict UI (who / when / what changed); they
never decide a merge. Ordering is decided by the `version` counter and the
per-device monotonic sequence; a device whose clock is absurdly ahead is flagged,
not trusted.

### Shared-folder / Dropbox / file-sync as the hub
Point every laptop at a synced folder (Dropbox, a Windows share) holding the DB
or a change log. **Rejected:** a file-sync layer cannot enforce an atomic
version check on push. Two laptops writing "since version 41" both succeed at the
file level and the later flush clobbers the earlier one with no rejection —
exactly the stale-push race the optimistic-concurrency check exists to catch. No
atomic compare-and-set, no safe hub.

## Consequences

**Positive**
- One synchronization contract (`SyncHubPort`) spans LAN v2 and the future cloud,
  and the cloud adapter is also the web SaaS backend — one system, not two
  products.
- Adding a laptop is O(1): it only ever talks to the hub. No pairwise mesh.
- Resolution logic lives in one place (`packages/domain/src/sync`) and is unit-
  testable off any real hub. The hub stays trivially simple and hard to get wrong.
- Optimistic concurrency + a retry loop serializes concurrent syncs with no
  distributed locks.

**Negative / trade-offs**
- The embedded-hub laptop must be reachable for others to sync; if it is off, the
  spokes queue their changes locally and sync when it returns (acceptable —
  offline-first already assumes local queueing).
- Conflict resolution is deferred to whoever syncs second, so a resolver may face
  a batch of clashes after a long offline stretch. The `sync.conflict-resolution`
  permission and the "conflits en attente" inbox exist to manage this.
- The change-log payload that becomes the sync-apply surface must be
  schema-version-tolerant across devices; that versioning decision is tracked
  separately in [SOU-170](https://linear.app/soufelhanafi/issue/SOU-170) and must
  land before [SOU-80](https://linear.app/soufelhanafi/issue/SOU-80)'s apply path
  is built on it.

## Downstream issues that reference this decision

- [SOU-79](https://linear.app/soufelhanafi/issue/SOU-79) — append-only change_log table (merged).
- [SOU-80](https://linear.app/soufelhanafi/issue/SOU-80) — SyncHubPort + pull→resolve→push + optimistic concurrency.
- [SOU-81](https://linear.app/soufelhanafi/issue/SOU-81) — conflict engine: field-level auto-merge, no wall-clock LWW.
- [SOU-82](https://linear.app/soufelhanafi/issue/SOU-82) — multi-laptop end-to-end sync test.
- [SOU-90](https://linear.app/soufelhanafi/issue/SOU-90) — embedded LAN hub server.
- [SOU-170](https://linear.app/soufelhanafi/issue/SOU-170) — change_log payload schema-evolution/versioning (gates SOU-80).

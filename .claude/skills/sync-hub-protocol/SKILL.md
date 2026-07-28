---
name: sync-hub-protocol
description: Implement and maintain Centre Soutien's hub-and-spoke synchronization — the SyncHubPort, the embedded laptop hub, the future cloud hub, the pull→resolve→push cycle, optimistic concurrency with version counters, per-device cursors, the conflict-resolution popup, and duplicate merging. Use this skill whenever a task mentions "sync", "hub", "conflict", "merge", "cursor", "version", "offline", "push", "pull", "resolve", "take my version", "duplicate", "pending conflicts", "conflits en attente", the sync page, or touches packages/domain/src/sync/, apps/desktop/src/main/hub-server/, apps/desktop/src/data/sync/, or the future apps/api sync routes. Err on the side of triggering — sync bugs silently corrupt data on every laptop of a paying center and are the most trust-destroying failure this product can have.
---

# Sync Hub Protocol — Centre Soutien

Sync is **hub-and-spoke**. Never peer-to-peer, never shared-folder. This skill defines the hub role, the wire cycle, the concurrency rules, and the human conflict flow. The entity-level prerequisites (envelope, `version`, change log, soft deletes, matching keys) live in `sync-safe-entities` — read both.

---

## 1. The hub is a role, not a machine

The hub is the single holder of the **canonical version** of one center's data. Every laptop is a local replica converging toward it. The hub does exactly four things:

1. **Store canonical state** — the current winning version of every entity, with its `version` counter.
2. **Serve deltas** — "everything changed since cursor X" for a given device.
3. **Accept pushes with version checks** — apply a write only if based on the current version; reject otherwise.
4. **Track cursors** — one per `(deviceId, centreId)`.

It does **not** do: business logic, conflict resolution, merging, UI. The hub is a dumb versioned mailbox. If you find yourself writing a merge rule in hub code, stop — it belongs in `packages/domain/src/sync`.

Why hub-and-spoke: with a hub, **5 laptops is the same problem as 2**. Every device only ever compares *my local changes* vs *the hub's canonical state*. Nobody ever resolves "laptop 2 vs laptop 4" — by the time laptop 3 syncs, that disagreement is already settled and the hub holds the winner. Peer-to-peer with 5 devices means 10 sync pairs, vector clocks, and the same conflict resolved differently on different pairs → permanent divergence. We refuse that entire class of problem.

Why not a shared folder / Dropbox / USB: no atomic version check on write → two simultaneous writers silently clobber each other. Rejected permanently, not deferred.

---

## 2. `SyncHubPort` — the swappable seam

```ts
// packages/domain/src/ports/sync-hub-port.ts
export interface SyncHubPort {
  pullChanges(centreId: CentreId, cursor: SyncCursor | null): Promise<ChangeBatch>;
  pushChanges(centreId: CentreId, batch: LocalChangeSet, baseVersions: BaseVersionMap):
    Promise<PushResult>;   // PushResult = accepted | rejected-stale (with fresh ChangeBatch)
  getCursor(deviceId: DeviceId, centreId: CentreId): Promise<SyncCursor | null>;
}
```

Two adapters, one port:

| Adapter | Where | When |
|---|---|---|
| **Embedded hub** | Node HTTP listener inside the Electron main process of one designated laptop (`apps/desktop/src/main/hub-server`), canonical store in its own SQLite. Other laptops reach it over the center's WiFi. | v2 — works with zero internet, zero hosting cost. |
| **Cloud hub** | `apps/api` (NestJS/Fastify) exposing the same routes over tenant-scoped Postgres. | Pro/Premium `sync.cloud` — and it is the same backend the web SaaS uses. The web app is "laptop N+1 that is always online". |

Migration A → C is a config change behind the port, never a habit change for the center.

**The hub laptop is never special.** It is *also* a working replica: its local DB syncs to its own embedded hub over localhost through the same `SyncHubPort` as every other device. No code path may check "am I the hub?" outside the composition root that starts the listener. This discipline is what makes the cloud migration a pure adapter swap.

Embedded-hub security: LAN only, per-center pairing token, never exposed beyond the local network. If the hub laptop is off, other devices queue and retry — syncs are never lost, only delayed.

---

## 3. The cycle: pull → resolve → push

Every sync, on every device, in this order:

1. **Pull** all changes since this device's cursor.
2. **Resolve** locally in `packages/domain/src/sync`:
   - Diff pulled entities against local pending edits **field by field** (the change log from `sync-safe-entities` makes this possible).
   - **Non-overlapping fields auto-merge silently.** Laptop A changed the phone, laptop B changed availability → both survive, no human involved. This is the majority of "conflicts" and must stay invisible.
   - **Same-field clashes, probable duplicates, and delete-vs-edit go to the popup** (§5).
3. **Push** the resolved set with `baseVersions`. The hub accepts iff each entity's base version equals its current canonical version, then increments `version`.
   - **Rejected-stale** (someone pushed in between — e.g. two laptops syncing at 18:00 closing time): re-run pull → resolve → push. One cheap retry loop serializes concurrent syncs with no locks. Cap retries (e.g. 5) and surface a "réessayer" state, never an infinite spin.

**Resolution always happens on the device that syncs second.** The other devices receive the outcome on their next pull with zero action required. Any design requiring a teammate to "please sync now" is rejected — coordination workflows die the day Fatima is busy.

### Ordering truth: versions, not clocks

Laptop clocks drift — dead CMOS batteries, manual changes, wrong timezones. Therefore:

- The `version` counter and the hub's push check are the **only** ordering authority.
- Each device also keeps a **monotonic local sequence** per write, so "B came after A on this device" is reliable even if its clock lies.
- Timestamps (UTC, from the `Clock` port) are **display information for the human** in the popup — never an auto-resolution criterion.
- A device whose clock is absurdly ahead/behind hub time gets flagged in the sync page ("L'horloge de PC Accueil semble incorrecte") and its timestamps are shown with a warning — its data still syncs, decided by versions.

---

## 4. Duplicate matching at sync time

Runs inside the resolve step, in **dependency order** (details and normalization rules in `sync-safe-entities`):

1. **Parents** — anchor: E.164-normalized phone. Name + phone exact → auto-merge (`MergeParents`). Shared phone across families → popup flag.
2. **Students** — normalized name + `parentId`. Two "Yassine Alaoui" never have the same father, so the parent is the discriminator. Same name, different parents, same birthdate/grade → popup flag (separated-family case). Different parents otherwise → two real students, keep both, no flag.
3. **Dependents** — enrollments, subscriptions, payments re-pointed by the merge use cases in one transaction.

Confidence tiers: **exact → silent auto-merge; partial → popup; none → keep both.** Payments never merge — a probable double-entry (same invoice + amount + same day) is flagged for the admin to void one, because payments are append-only.

---

## 5. The conflict popup (renderer `sync` page)

The contract the UI must honor:

- **Tabs per entity type** (Students, Teachers, Parents, Invoices…) **plus a dedicated Delete-vs-edit tab.** Delete-vs-edit (A archived a student, B marked their attendance) is **never auto-resolved in either direction** — it signals a real-world misunderstanding between staff, not a data race.
- Each side shows **who** (user + device name — "Fatima / PC Accueil"), **when** (relative UTC time, exact on hover), **what changed** (field diff only — not the whole record).
- **Per-field resolution** (mine for the phone, theirs for the address) plus whole-entity shortcuts **"Prendre ma version" / "Prendre leur version"**.
- The more recent version **may be pre-selected as a convenience**; confirming is always a human click. Pre-selection uses versions/sequences, with the timestamp shown as context.
- Resolution produces a fresh write (new `version` on push) so the outcome deterministically wins on every other device's next pull.
- **Volume discipline:** if auto-merge is implemented correctly, the popup appears rarely (target: same-field clashes only, ~1 family in 50 for duplicates). If it fires on every sync, the field-merge is broken — fix that, do not train admins to click through.

### Who may resolve

`sync.conflict-resolution` is a per-user permission (Pro/Premium). A non-authorized user's sync applies all safe auto-merges and queues genuine clashes into the **"Conflits en attente"** inbox, visible to authorized admins from **any** machine. A 5-laptop center must never have data decisions made by whoever happened to press sync. The permission check is a domain `PlanPolicy` + role check, not a UI-only hide.

---

## 6. Hub-side storage rules

Whether embedded SQLite or cloud Postgres, canonical storage keeps:

- Current entity rows with `version` (monotonic per entity, assigned on accepted push).
- An append-only **change feed** (`entity_id`, `version`, changed fields, `deviceId`, `updatedBy`, server receive time) — this is what `pullChanges` reads by cursor position.
- Cursor table keyed `(deviceId, centreId)` — a laptop offline for two weeks just pulls a bigger batch; nothing special.
- Everything scoped by `centreId`. A pull or push can never span centers (see `multi-center-tenancy`).

Retention: the change feed may be compacted below the oldest live cursor, never above it.

---

## 7. Testing requirements

Unit (pure domain, in-memory hub fake):

- pull→resolve→push happy path; rejected-stale push triggers exactly one re-cycle; retry cap reached surfaces error state.
- Field merge: disjoint fields auto-merge; same-field clash produces a `Conflict` object, not a write.
- Delete-vs-edit produces a `Conflict` of its own kind — asserting it is never auto-resolved either way.
- Duplicate matcher: parents-before-students ordering; E.164 variants collide; "same name, different parent" yields no flag; "same name + birthdate, different parents" yields a flag.
- Clock-skew: a device stamping future timestamps still loses to a higher `version`.
- Permission: unauthorized resolver → safe merges applied + clash queued, nothing else written.

Integration: embedded hub over localhost HTTP with two simulated devices — full convergence after alternating edits; simultaneous push race (one accepted, one rejected-stale, both converge).

E2E (Playwright, two app instances or scripted hub): the popup renders tabs, who/when/what, per-field choice, and both shortcut buttons — in FR-LTR and AR-RTL.

---

## 8. Common mistakes

| Mistake | Fix |
|---|---|
| Merge or resolution logic in `hub-server` or a data adapter. | Move to `packages/domain/src/sync` / merge use cases. Hub stays a dumb mailbox. |
| `if (isHubMachine)` outside the composition root. | The hub laptop syncs to itself over localhost like everyone else. |
| Auto-resolving by `updatedAt` comparison. | Versions decide; timestamps are display context. |
| Whole-record conflict shown when one field clashed. | Diff per field; auto-merge the rest; popup shows only the clash. |
| Delete-vs-edit auto-resolved (either direction). | Dedicated tab, human decision, always. |
| Sync flow that asks a teammate to act ("tell them to sync"). | Resolution on the second syncer; others converge on next pull. |
| Push without `baseVersions`, or accepting a stale push. | Optimistic concurrency is non-negotiable; add the retry loop. |
| One global cursor for a device across centers. | Cursor per `(deviceId, centreId)`. |
| Popup fires on every sync. | Your field-merge or matcher is broken. Fix the engine, not the admins. |

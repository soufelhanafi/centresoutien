# Centre Soutien — Desktop v2 (Electron)

This file is loaded automatically by Claude Code at the start of every session. It defines what the project is, how it is architected, and the non-negotiable rules for changing it. Read all of it before touching any code.

---

## 1. Product

Centre Soutien is a bilingual French / Arabic (with native RTL) offline-first desktop application for Moroccan academic support centers. It manages rooms, teachers, students, parents, groups, recurring weekly sessions, monthly invoicing in MAD, and multi-laptop synchronization.

The landing page is at `centresoutien.com` and defines the visual language. Match it.

### Target users

Center directors, secretaries, and admins. Not tech people. The UI must never leak Electron / SQLite / sync internals into user-facing copy.

### Non-goals for v2 (not built now — but explicitly designed for)

- Web SaaS frontend (`apps/web`) and public API.
- Parent-facing portal.
- Mobile app.

These are on the roadmap, not in v2. The architecture is deliberately shaped so that they arrive as **new adapters and apps in the monorepo**, never as rewrites:

- The **domain is a portable package** (`packages/domain`) with zero platform dependencies. The future backend hosts the same package with Postgres adapters instead of SQLite.
- The **sync hub is a port** (`SyncHubPort`). v2 ships with an embedded hub on a designated laptop; the cloud API later implements the same port, and it doubles as the backend of the web SaaS. One system, not two products.
- The **web frontend is "laptop N+1 that is always online"** — same domain, same conflict engine, HTTP adapters instead of IPC.
- **Plans are configuration, never branches.** One codebase, one `plans.ts` entitlements registry. On desktop the plan comes from the license file; on web it will come from the subscription record and be enforced server-side. We never fork branches per plan or per platform.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron (latest stable) | Cross-platform desktop, mature. |
| UI framework | React 19 + TypeScript strict | Team knowledge, huge ecosystem. |
| Styling | Tailwind CSS + shadcn/ui | Landing page uses these. Consistency. |
| Icons | Lucide | Landing page uses these. |
| State (UI) | Zustand | Simple, testable, no boilerplate. |
| Data fetching | TanStack Query | Cache, retry, and mutation semantics for IPC. |
| Forms | React Hook Form + Zod | Schema-first validation shared with domain. |
| i18n | react-intl (or i18next) with ICU messages | AR / FR + RTL. |
| Repo layout | pnpm workspaces monorepo (+ Turborepo if builds slow down) | One repo for desktop, future api/web, landing, shared domain + UI packages. |
| DB | better-sqlite3-multiple-ciphers (SQLCipher) | Zero server, transactional, fast — **encrypted at rest** (children's personal data, loi 09-08). One DB file **per center**. |
| Migrations | Custom versioned migration runner in Domain layer | Portable to other DBs. |
| PDF | pdf-lib (pure JS) | Portable to browser later. |
| Excel | exceljs | Read + write for import / export / Excel sync. |
| Testing | Vitest (unit), Playwright with Electron driver (E2E) | Standards. |
| Linting | ESLint + typescript-eslint (strict) + Prettier | Enforced in CI. |
| Package manager | pnpm | Speed and disk usage. |
| Build | electron-vite + electron-builder | Fast dev, good installers. |

### Version policy

- Node.js 20 LTS or 22 LTS.
- pnpm 9+.
- TypeScript `strict: true` — no exceptions, no `any` in application code.
- `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

---

## 3. Architecture — Clean layered separation (critical)

The application is split into **three layers**. This is the most important rule in this document. Violating it forfeits our ability to later ship a web version reusing the domain and frontend.

```
┌───────────────────────────────────────────────────────┐
│ Presentation Layer                                    │
│   - React components, hooks, pages, i18n, Zustand.    │
│   - Electron: renderer process + IPC bridge.          │
│   - Web (future): REST/tRPC controllers.              │
│   - NO business logic. NO database calls. NO fs.     │
├───────────────────────────────────────────────────────┤
│ Domain Layer  (a.k.a. core / application)             │
│   - Entities, value objects, use cases, ports.        │
│   - Pure TypeScript. No React. No Electron. No SQL.   │
│   - Depends on nothing except types and other domain. │
│   - This is the layer we will export unchanged        │
│     to a Node backend or a browser bundle later.      │
├───────────────────────────────────────────────────────┤
│ Data Layer  (a.k.a. infrastructure)                   │
│   - SQLite adapter implementing domain repository     │
│     ports.                                            │
│   - Excel adapter, PDF adapter, filesystem adapter.   │
│   - Replaceable with Postgres/HTTP later without      │
│     touching Domain or Presentation.                  │
└───────────────────────────────────────────────────────┘
```

### Dependency direction

**Presentation → Domain ← Data.** Domain depends on **nothing outside itself**. Data implements ports declared by Domain. Presentation calls Domain use cases, which internally receive Data adapters via dependency injection.

This is a hexagonal / ports-and-adapters shape. Domain declares the ports (interfaces); Data provides the adapters; a composition root wires them together at startup.

### Forbidden imports

- Domain **must not** import React, Electron, `better-sqlite3`, `fs`, `path`, `os`, `child_process`, `exceljs`, `pdf-lib`, or any browser-only API.
- Presentation **must not** import `better-sqlite3` or `fs` directly. All data access goes through domain use cases exposed via the IPC bridge.
- Data **must not** import React or anything from Presentation.

An ESLint rule enforces this. If a task requires bypassing it, the answer is "no, restructure".

### Directory layout

```
centre-soutien/                          # ONE pnpm-workspaces monorepo — never branches per plan or platform
├── apps/
│   ├── desktop/                     # Electron app (the v2 deliverable)
│   │   └── src/
│   │       ├── main/                # Electron main process
│   │       │   ├── index.ts         # App entry
│   │       │   ├── ipc/             # IPC handlers (presentation adapter)
│   │       │   ├── composition-root.ts  # Wires domain + data + ipc + hub adapter
│   │       │   ├── hub-server/      # Embedded sync hub (Node HTTP in main process) — see §Sync
│   │       │   └── window.ts
│   │       ├── preload/             # Typed IPC bridge
│   │       ├── renderer/            # React app (presentation layer)
│   │       │   ├── app/             # App root, providers, router, CENTER SWITCHER
│   │       │   ├── pages/           # dashboard, calendar, subjects, formulas,
│   │       │   │                    # groups, students, teachers, teacher-payroll,
│   │       │   │                    # rooms, payments, parents, invoice-template,
│   │       │   │                    # import-export, sync (incl. conflict popup +
│   │       │   │                    # pending-conflicts inbox), settings
│   │       │   ├── components/      # Desktop-only UI; shared primitives live in packages/ui
│   │       │   ├── hooks/  stores/  i18n/  lib/
│   │       └── data/                # Desktop infra adapters
│   │           ├── sqlite/          # SQLCipher DB — ONE FILE PER CENTER
│   │           │   ├── db.ts        # open(centreId) + migration runner
│   │           │   ├── migrations/
│   │           │   └── repositories/
│   │           ├── sync/            # HTTP client adapter implementing SyncHubPort
│   │           ├── excel/  pdf/  fs/
│   ├── api/                         # FUTURE — cloud hub + web SaaS backend (NestJS/Fastify + Postgres,
│   │                                # tenant-scoped by centreId; implements the SAME SyncHubPort routes)
│   ├── web/                         # FUTURE — web SaaS frontend (reuses packages/domain + packages/ui)
│   └── landing/                     # Existing Next.js site (centresoutien.com)
├── packages/
│   ├── domain/                      # <-- THE portable core; no infra, no React, no Electron
│   │   └── src/
│   │       ├── entities/            # Organization, Membership, Center, CenterHours, Holiday,
│   │       │                        # Subject, Formula, StudentSubscription, Student, Teacher,
│   │       │                        # TeacherPayrollRule, TeacherPayout, Room, Group, Parent,
│   │       │                        # Session, Invoice, InvoiceLine, Payment (append-only)
│   │       ├── value-objects/       # Money, Percentage, TimeSlot, WeeklyBlock, DateRange,
│   │       │                        # EntityId, SessionKind, PhoneNumber (E.164)
│   │       ├── use-cases/           # incl. MergeParents, MergeStudents, ResolveConflict
│   │       ├── ports/               # Repository interfaces + SyncHubPort + Clock + IdGenerator
│   │       ├── sync/                # Sync engine: pull→resolve→push, field merge,
│   │       │                        # duplicate matching (parents first), cursors
│   │       ├── policies/            # Conflict detection, invoice generation, payout calc,
│   │       │                        # plan gating, duplicate-matching policy
│   │       ├── errors/
│   │       └── plans/               # Plan definitions + feature flags (single source of truth)
│   ├── ui/                          # Shared shadcn/ui wrappers — RTL-safe, used by desktop AND future web
│   └── config/                      # Shared tsconfig, eslint, prettier presets
├── .claude/
│   └── skills/                      # <-- this skills package
├── pnpm-workspace.yaml
├── turbo.json                       # optional, when builds slow down
└── package.json
```

Tests live inside each package/app (`packages/domain/tests`, `apps/desktop/tests/{integration,e2e}`), so `pnpm --filter domain test` runs the pure core in isolation.

### `packages/domain` tsconfig — enforces isolation

The domain package compiles with its own strictest tsconfig (extending `packages/config`):

- Excludes `dom` and `dom.iterable` libs.
- Declares **zero workspace dependencies** — it cannot resolve `apps/*` or `packages/ui`. The workspace graph enforces the direction: apps depend on domain, never the reverse.
- `pnpm --filter domain typecheck` is what CI runs first — if it fails, no other checks run.

### Composition root

`apps/desktop/src/main/composition-root.ts` is the single place where concrete adapters are constructed and injected into use cases. Nothing else instantiates a repository.

```ts
// example
const db = openDatabase(userDataPath);
const studentRepo: StudentRepository = new SqliteStudentRepository(db);
const parentRepo: ParentRepository = new SqliteParentRepository(db);
const createStudent = new CreateStudentUseCase(studentRepo, parentRepo, planPolicy);
registerIpcHandler('student.create', createStudent);
```

Presentation calls IPC → IPC handler calls the pre-wired use case → use case calls port → port is implemented by the SQLite adapter. Straight line, testable at every seam.

---

## 4. Multi-plan / multi-version support

The application is sold in three tiers: **Essentiel**, **Pro**, **Premium**. Every version is the same binary; features are gated at runtime by the active plan.

### Plan configuration

`packages/domain/src/plans/plans.ts` is the single source of truth:

```ts
export type PlanId = 'essentiel' | 'pro' | 'premium';

export type FeatureFlag =
  // core (every plan)
  | 'core.rooms'
  | 'core.teachers'
  | 'core.students'
  | 'core.groups'
  | 'core.subjects'                  // configure center's subject list
  | 'core.formulas'                  // configure priced subject bundles
  | 'core.calendar.week'
  | 'core.invoicing'                 // monthly, formula-based
  | 'settings.center-hours'
  | 'dashboard.basic'
  // pro
  | 'core.parents'
  | 'core.invoicing.partial-paid'
  | 'core.invoice-template.customize'
  | 'core.exam-prep'                 // exam-prep formulas + groups, kept separate
  | 'payroll.teacher'                // teacher payroll module base
  | 'payroll.teacher.fixed'          // fixed monthly amount
  | 'payroll.teacher.percentage'     // percentage of monthly attributable fees
  | 'settings.holidays'
  | 'io.excel.export'
  | 'io.excel.import'
  | 'io.excel.sync'
  | 'planning.custom-grid'
  // premium
  | 'dashboard.advanced'
  | 'planning.random-auto'
  | 'sync.multi-device'
  | 'sync.cloud'
  | 'sync.conflict-resolution'        // per-user permission: who may settle sync conflicts
  | 'org.multi-center'               // cross-center consolidated views (requires cloud hub)
  | 'limits.students.unlimited'
  | 'limits.teachers.unlimited';

export type PlanLimits = {
  maxStudents: number | 'unlimited';
  maxTeachers: number | 'unlimited';
  maxRooms: number | 'unlimited';
};

export type Plan = {
  id: PlanId;
  features: ReadonlySet<FeatureFlag>;
  limits: PlanLimits;
};
```

### The three rules of plan gating

1. **Domain-side gate is the source of truth.** Every use case that touches a gated feature calls `PlanPolicy.require(feature)` at its start. If the plan lacks the feature, it throws `PlanFeatureUnavailableError`. This is the only rule that matters for security; UI hiding is cosmetic.
2. **UI hides gated features via `useFeature('flag.name')`.** No component conditionally renders based on `plan.id` directly. Always feature flags, never plan names.
3. **Switching plans is a one-line change** to the active plan configuration read at startup (from license or dev override). See the `plan-feature-gate` skill for the procedure.

### Limits

Limits are enforced in the same policy layer. Adding a student when `maxStudents` is reached throws `PlanLimitExceededError` from the use case, and the UI shows the upgrade CTA.

---

## 5. Sync-safe entity IDs

Because Pro+ tiers sync between 2+ laptops, IDs must be **globally unique without a central server** and must not collide when the same person is created on two devices before their first sync. See the `sync-safe-entities` skill for full detail. The short rules:

- Every entity has a stable `id: EntityId` (branded string, ULID). ULIDs sort lexicographically by time, which makes sync merges cheap.
- Every entity carries the **full envelope**: `centerCode` (e.g. `CS-CASA-001`), `createdAt`, `updatedAt`, `deletedAt` (soft delete only), `deviceOrigin` (device that first created the row), `updatedBy` (user ULID of the last editor), and `version` (integer, incremented by the hub on every accepted write — the optimistic-concurrency counter).
- **All timestamps are UTC and come from the injected `Clock` port** — never `new Date()` scattered in code. Timestamps are **information for humans** in the conflict UI (who / when / what changed); they never decide a merge on their own, because laptop clocks drift. The `version` counter and per-device monotonic sequence decide ordering; a device whose clock is absurdly ahead is flagged, not trusted.
- People-like entities (Student, Teacher, Parent) additionally carry a `naturalKey` — a **matching key for duplicate detection, not a hard business constraint**. Duplicate matching runs in dependency order: **parents first (anchored on E.164-normalized phone), then students (normalized name + parentId — two "Yassine Alaoui" never have the same father), then dependents**. Confidence tiers: exact match → auto-merge; partial/fuzzy match → the conflicts popup; no match → keep both.
- **No hard deletes ever.** Deletes set `deletedAt`. This makes tombstone sync trivial.
- **Every write bumps `updatedAt` and records the changed field names** (per-entity change log). At sync time, non-overlapping field changes **auto-merge silently**; only same-field clashes reach the human. Blind wall-clock last-writer-wins is forbidden.
- **Payments are append-only.** Invoice `status` is derived from the sum of `Payment` records, never stored as an editable scalar — append-only entities cannot conflict. The only payment "conflict" is a probable double-entry (same invoice + amount + day), which goes to the duplicates tab.

The domain repository ports enforce this. If a SQLite `DELETE` shows up in a repository implementation, the code review must reject it. Full detail: `sync-safe-entities` and `sync-hub-protocol` skills.

---

## 5bis. Sync architecture — the hub

Sync is **hub-and-spoke, never peer-to-peer**. With a hub, 5 laptops is the same problem as 2: every device only ever converses with the hub's canonical state.

### The hub is a role, not a machine

The hub is the single holder of the **canonical version** of a center's data. It is deliberately dumb — a versioned mailbox that does exactly four things: store canonical state with version counters, serve deltas ("everything since cursor X"), accept pushes with version checks, and track one cursor per `(deviceId, centreId)`. **No business logic, no conflict resolution, no UI.** Resolution happens on laptops, in `packages/domain/src/sync`.

### `SyncHubPort` — the swappable seam

Defined in `packages/domain/src/ports/sync-hub-port.ts`, roughly: `pullChanges(centreId, cursor)`, `pushChanges(centreId, batch, baseVersions)`, `getCursor(deviceId, centreId)`. Two adapters share it:

- **v2 (offline centers): embedded hub** — a small Node HTTP listener inside the Electron main process of a designated laptop (`apps/desktop/src/main/hub-server`), canonical store in its own SQLite, other laptops sync over the center's WiFi. The hub laptop is *also* a working replica: its local DB syncs to its own embedded hub over localhost through the same port as everyone else — the hub machine is never special-cased.
- **Later (Pro/Premium cloud): the API** — `apps/api` exposes the same port as authenticated HTTP routes over tenant-scoped Postgres. Upgrading a center is a config change, not a habit change. This API is also the web SaaS backend.

Shared-folder / Dropbox sync is **rejected** as a hub: it cannot enforce version checks atomically.

### The sync cycle: pull → resolve → push

1. **Pull** everything changed on the hub since this device's cursor.
2. **Resolve** locally: auto-merge non-overlapping field changes; open the conflict popup only for same-field clashes, duplicates, and delete-vs-edit. Resolution always happens on the device that syncs **second** — other devices simply receive the outcome on their next pull, no coordination ever required between teammates.
3. **Push** with `baseVersions`. If the hub is already past any base version (someone pushed in between), the push is rejected and the device re-runs the cycle — one cheap retry loop serializes concurrent syncs without locks.

### Conflict popup rules (the `sync` page)

- Tabs per entity type + a dedicated **delete-vs-edit** tab (never auto-resolved in either direction — it signals a real-world misunderstanding, e.g. one laptop archived a student the other marked present).
- Each version shows **who** (user / device name), **when** (relative UTC time), **what changed** (field diff). The more recent version may be *pre-selected* as a convenience; confirming is always a human click.
- Per-field resolution (mine for the phone, theirs for the address) + whole-entity shortcuts **"take my version" / "take their version"**. Resolution produces a new version with a fresh counter so it deterministically wins everywhere afterward.
- Duplicates tab: parents-first matching (phone anchor), then students by name + parentId; edge cases (separated families → same child under two parents; shared phone → over-merge risk) are flagged, never auto-merged.
- **Who may resolve** is a Pro/Premium setting (`sync.conflict-resolution` permission). Non-authorized users' syncs apply the safe merges and queue genuine clashes in the **"conflits en attente"** inbox for an admin to settle from any machine.

---

## 5ter. Multi-center organizations

An admin may own or manage several centers. The rule: **multi-center is an authorization and packaging layer — it must never leak into sync, billing math, or the domain rules above.**

- New entities: `Organization`, and `Membership { userId, centreId, role }`. A user belongs to N centers with possibly different roles in each.
- **Center stays the tenant.** Every entity keeps its `centerCode`; sync scopes, cursors, matching keys, invoices — all per-center. The same child attending two centers of one owner is legitimately two records.
- **Desktop: one SQLCipher file per center** + a center switcher in the app shell. Switching = close one DB, open another. No merged cross-center views in the desktop app.
- `SyncHubPort` addressing is per `(deviceId, centreId)`; nothing else about sync changes.
- **Cross-center consolidation** (org-wide revenue, dashboards, moving templates between centers) is a cloud/web feature — Premium flag `org.multi-center` — because only the cloud hub guarantees fresh data for all centers.
- **Billing attaches to the center** (each center has its own plan/license); the Organization is the billing contact receiving one consolidated invoice. One org can run Essentiel in an annex and Premium in the flagship.

---

## 5quater. Security baseline

- **Encryption at rest**: SQLCipher via `better-sqlite3-multiple-ciphers` on every center DB file. The app stores children's personal data — loi 09-08 applies.
- **Electron hardening**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where possible, a strict typed preload API surface, no remote content loading. This is the actual attack surface of the desktop app.
- **Plan gating on desktop is honest-user enforcement** (license file + domain policy) — accept that a determined user can bypass a local binary. Design entitlements so the same flags are enforced **server-side** in `apps/api` the day the cloud exists; the web tier never trusts the client.
- The embedded hub listens on the LAN only, requires a per-center pairing token, and never exposes itself beyond the local network.

---

## 6. Center hours, holidays, and teacher payroll

Three cross-cutting features that touch scheduling, invoicing, and the domain conflict engine. All three are declared in the domain and enforced there — the UI is only the surface.

### Center hours

The admin configures per-weekday opening and closing times (Sunday is treated as its own weekday — it may be closed, or have shorter/longer hours). Stored as a `CenterHours` entity with one row per weekday: `{ dayOfWeek: 0..6, open: 'HH:mm' | null, close: 'HH:mm' | null }`. `null` open means "closed that day".

- Feature flag: `settings.center-hours` (every plan).
- Conflict detection: `SessionConflictPolicy` gains a `withinCenterHours` check. Sessions that fall outside opening hours are rejected with `SessionOutsideCenterHoursError` — one of the standard conflict types shown in the add-session drawer.
- Calendar rendering: closed hours are visually grayed out in the weekly grid; the auto-planner never proposes them.

### Holidays

The admin can add one-off or annually recurring holidays (national holidays, Eid, school breaks). Stored as `Holiday` entities: `{ id, centerCode, name: { fr, ar }, startDate, endDate, recurrence: 'none' | 'annual-gregorian' }`.

- Feature flag: `settings.holidays` (Pro+).
- **Lunar holidays** (Eid al-Fitr, Eid al-Adha, etc.) are added manually each year with `recurrence: 'none'` — we deliberately do **not** compute a Hijri calendar. Moroccan lunar dates are officially announced by the government and can shift by a day at the last minute; predicting them is not our business.
- Conflict detection: `SessionConflictPolicy` gains a `notOnHoliday` check. Recurring sessions skip holiday days when materialized into concrete session instances; single-session creation on a holiday is rejected with `SessionOnHolidayError`.
- **Invoicing is not affected by holidays.** All billing is monthly (student subscriptions to formulas, teacher payouts) — never per session. A month with a holiday charges the same as any other month. This is the standard practice for Moroccan support centers and it simplifies the domain.
- Calendar rendering: holiday days show the holiday name (bilingual) as a full-day banner across the day column.

### Teacher payroll

All payment in this app is **monthly** — for students and for teachers alike. Never per session. Every teacher can be paid via one of two rule types — captured in the `TeacherPayrollRule` value object:

- `{ type: 'fixed-monthly', amount: Money }` — a flat monthly amount regardless of sessions or student count.
- `{ type: 'percentage-of-monthly-fees', percent: Percentage }` — a percentage of the monthly fees **attributable** to this teacher.

**Attribution math** for the percentage rule (this is a business rule that must live in one policy, `TeacherFeeAttributionPolicy`, and be reused everywhere — dashboard, payout, reports):

1. For each student who has an active `StudentSubscription` to a `Formula` in the month, take the formula's monthly price after discount.
2. Split it **equally** across the formula's subjects. A 350 MAD `Math + Physique` formula contributes 175 MAD to Math and 175 MAD to Physique for that student.
3. For each subject, look up the group in which the student attended that subject during the month; the group's teacher receives that portion in their attribution bucket.
4. Only fees **actually collected** (invoice status `paid` or the paid portion of `partially-paid`) count toward attribution. Draft, cancelled, and uncollected invoices are excluded.
5. The teacher's monthly payout under the percentage rule = attributed amount × percent.

This is the default. If a center wants a different split (weighted by hours, custom weights per subject), that becomes a future toggle — do not fork the policy.

The `TeacherPayoutCalculator` policy is a pure domain policy that consumes the attribution result and produces a `TeacherPayout` proposal. The user reviews and confirms; confirmed payouts are recorded as `TeacherPayout` entities. Never auto-pay.

- Feature flags:
  - `payroll.teacher` (base) — Pro+.
  - `payroll.teacher.fixed` — fixed rule type (Pro+).
  - `payroll.teacher.percentage` — percentage rule type (Pro+).
- Payouts are entities and follow the sync-safe rules (ULID, envelope columns, soft delete). They are **never** auto-generated — the domain proposes, the human confirms.
- A `TeacherPayout` in status `paid` is immutable (only its `notes` field can change). Reversing a payout creates a `reversal` payout, it does not mutate the original.

### Dashboard: basic vs advanced

The dashboard has a **Basic** view (feature `dashboard.basic`, every plan) and an **Advanced** view (`dashboard.advanced`, Premium). The toggle is a segmented control in the page header.

- **Basic**: the four card groups from v1 (Argent, Effectifs, Charge enseignants, Séances) with no trend arrows.
- **Advanced**: adds trend deltas vs previous month, per-teacher profitability (revenue attributable minus their computed payout), enrollment retention curve, room utilization %, holiday-adjusted session count, and outstanding-invoices aging buckets.

Both views share the same data query surface — Advanced adds selectors on top. Never re-derive the same KPI twice.

---

## 7. Subjects, formulas, and exam preparation

This is how billing actually works in Centre Soutien. Students do not enroll and pay per-group; they subscribe to a **Formula** — a priced bundle of subjects the center defines. The group is where they learn; the formula is what they pay for.

### Subjects

Each center configures its own list of subjects. A small center may only offer Math; another may offer Math, Physique, Chimie, SVT, Géo, Anglais, Français, Arabe, Philosophie, and so on.

- Entity: `Subject { id, centerCode, name: { fr, ar }, active, ...envelope }`.
- Feature flag: `core.subjects` (every plan).
- **Soft delete only.** A subject that is referenced by any active `Formula` or any `Group` cannot be deleted — the use case throws `SubjectInUseError`. Deactivating (`active = false`) is allowed; it removes it from new-formula pickers while preserving history.

### Formulas

A Formula is the priced bundle:

- Entity: `Formula { id, centerCode, name: { fr, ar }, subjectIds: readonly SubjectId[], monthlyPrice: Money, kind: 'regular' | 'exam-prep', active, ...envelope }`.
- Examples: *Math seul — 200 MAD/mois*, *Math + Physique — 350 MAD/mois*, *Math + Physique + SVT + Géo — 550 MAD/mois*, *Préparation Bac Math — 800 MAD/mois* (exam-prep).
- Feature flag: `core.formulas` (every plan).
- **Immutable pricing after use.** The `monthlyPrice` on a Formula that has any past `Invoice` line referencing it cannot be edited. Changing the price creates a *new* Formula and deactivates the old one — old invoices keep their historical price forever. This is standard bookkeeping and it makes sync deterministic.
- A Formula's `subjectIds` list is also immutable after first use (same reason). Add a new Formula instead of mutating one.
- Subjects and formulas may be `active = false` to hide from new subscriptions but keep them queryable for historical reports.

### Student subscriptions

- Entity: `StudentSubscription { id, centerCode, studentId, formulaId, startMonth, endMonth: 'YYYY-MM' | null, discount, ...envelope }`.
- A student holds **at most one active `regular` subscription and one active `exam-prep` subscription** at any given month. The domain enforces this with `TooManyActiveSubscriptionsError`.
- Changing formulas mid-year = close the current subscription with `endMonth` and open a new one for the next month. Never edit an active subscription in place.
- Discounts (`none` / percentage capped at 100 / fixed amount) live on the subscription, not the formula. That's how one student gets a family discount without corrupting the formula's canonical price.

### Groups and subjects

- `Group` gains `subjectId: SubjectId` (mandatory) and `kind: 'regular' | 'exam-prep'` (mandatory).
- A student attends a group only if:
  1. Their active subscription of the matching `kind` covers the group's `subjectId`, and
  2. They are explicitly enrolled in the group (a student on `Math + Physique` picks *which* Math group to attend when the center has more than one).
- Enrollment is a small joining entity: `Enrollment { id, studentId, groupId, startMonth, endMonth, ...envelope }`. Enrollment has no fee — the fee is on the subscription's formula.

### Monthly invoice generation, revisited

Invoices are generated **per active subscription**, not per group.

- One `Invoice` per student per month.
- One `InvoiceLine` per active subscription that month. A student on both a regular and an exam-prep formula has two lines.
- Each line: `formulaName × 1 month = monthlyPrice`, minus the subscription's discount, = line total. The **regular** and **exam-prep** lines are visually grouped in separate subsections on the invoice, with their own subtotals.
- Groups appear nowhere on the invoice. Groups are for scheduling and attendance, not billing.
- Legacy fallback: if the center is using the app before defining formulas (day one), a student with only group enrollments and no subscription can be temporarily billed via per-group fees for backward compatibility during the first-month migration. Log a `LegacyPerGroupBillingUsed` domain event so the admin is nudged to define formulas.

### Exam preparation — the isolation rule

Exam-prep is treated as its own track that must never bleed into the regular track. Concretely:

- A `Session` has `kind: 'regular' | 'exam-prep'` inherited from its group.
- Calendar rendering shows exam-prep sessions with a distinct visual treatment (border style + small "PE" badge). See the Fable brief.
- The Auto-planner plans regular and exam-prep independently; it never mixes them into the same group's schedule.
- Conflict detection still applies across both tracks — a student is only in one place at a time. But **enrollment** guards prevent a student on only a regular subscription from being added to an exam-prep group and vice versa (`CrossKindEnrollmentError`).
- Reports (dashboard, payouts, invoice totals) can filter by `kind` — regular vs exam-prep — and the domain must expose the split at the query level, not by grepping strings in the UI.

- Feature flag: `core.exam-prep` (Pro+). On Essentiel, all formulas and groups are forced `kind = 'regular'` and the exam-prep UI is hidden.

---

## 8. Bilingual FR / AR + RTL

Everything visible to users must have a French and an Arabic translation, and the whole app must render correctly in RTL when Arabic is active.

- Never hardcode user-facing strings. Every string lives in `apps/desktop/src/renderer/i18n/fr.json` and `ar.json` under the same key.
- Numbers, dates, and money are locale-formatted. MAD is the only currency.
- Use Tailwind logical properties (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`) — never `pl-*` / `pr-*` / `ml-*` / `mr-*`.
- Icons that carry direction (arrows, chevrons) must mirror in RTL. Use the `rtl:` prefix.
- Test both directions in E2E.

---

## 9. Testing standards

- **Unit tests** live under `tests/unit/` and mirror `packages/domain/src/` one-to-one. Every use case has at least one unit test per business path (happy, plan-locked, limit-exceeded, conflict, validation error). See the `unit-testing` skill.
- **Integration tests** cover the SQLite adapter (in-memory DB) and Excel round-trip.
- **E2E tests** live under `tests/e2e/` and run against the packaged Electron app via Playwright's `_electron` API. There must be one E2E per top-level user flow: first-run setup, login, create student, create group, schedule session, generate invoice, mark paid, Excel round-trip, plan-locked feature attempt. See the `e2e-testing` skill.
- **CI runs**: `pnpm typecheck && pnpm typecheck:domain && pnpm lint && pnpm test && pnpm test:integration && pnpm build && pnpm test:e2e`. In that order. A failure at any step aborts the rest.
- **Coverage floor**: 90% lines and branches on the `packages/domain/src/` folder. Presentation and data have no floor but must not regress against the previous main.

---

## 10. Coding standards

Governed in detail by the skills below. In one paragraph: SOLID, small files, small functions, no `any`, no comment-out-then-commit, no god components, no shared mutable state outside Zustand stores, no I/O in domain, no business logic in UI, no untranslated user-facing string, no direction-blind styling, and no plan check outside the domain policy layer.

---

## 11. Skills available in this repo

Read these before writing code. Claude Code loads them automatically when their triggers match.

| Skill | Triggers on | Enforces |
|---|---|---|
| `solid-coding` | Any code change | SOLID, KISS, DRY-with-threshold, YAGNI, TS strictness |
| `clean-architecture` | Any file that crosses layers | Presentation / Domain / Data isolation, port + adapter shape |
| `component-size-limits` | New or edited React / TS file | Line count, function length, prop count, cyclomatic ceiling |
| `unit-testing` | New or edited use case, policy, or entity | Vitest structure, coverage, table-driven cases, no infra imports in tests |
| `e2e-testing` | New or edited user flow | Playwright + Electron patterns, fresh-DB setup, both LTR and RTL runs |
| `code-review` | Pre-review self-review, PR review | 22-point checklist covering architecture, tests, i18n, RTL, plan gating, sync-safety, tenancy |
| `plan-feature-gate` | New or gated feature | Feature-flag naming, domain enforcement, UI `useFeature` hook, migration path between plans |
| `sync-safe-entities` | New entity, new repo method, any schema change | ID scheme, full envelope (incl. `version`, `updatedBy`), soft delete, per-field change log, naturalKey rules, append-only payments |
| `sync-hub-protocol` | Any sync, hub, conflict, merge, or cursor work | Hub-as-dumb-mailbox, `SyncHubPort`, pull→resolve→push, optimistic concurrency, conflict popup rules, parents-first dedup |
| `multi-center-tenancy` | Any feature touching Organization, Membership, center switching, or cross-center data | Center = tenant, one DB per center, membership roles, org layer isolation, cloud-only consolidation |
| `pre-merge-check` | Before every merge | Final ordered gate: types, domain isolation, lint, unit, integration, build, E2E, i18n parity, RTL, plan-gate audit |

### Order of authority (when skills conflict)

1. `pre-merge-check` — last line of defense.
2. `clean-architecture` — architectural integrity.
3. `sync-safe-entities` + `sync-hub-protocol` — data correctness (data loss risk).
4. `multi-center-tenancy` — tenant isolation (data leak risk).
5. `plan-feature-gate` — revenue correctness.
6. `unit-testing` / `e2e-testing` — proof of correctness.
7. `solid-coding` — code quality.
8. `component-size-limits` — code quality.
9. `code-review` — meta / process.

---

## 12. How to start any coding task

1. Read the relevant skill files if not already loaded.
2. Restate the task in one sentence. If it has "and" twice, split it.
3. Identify which layer the change belongs to. If more than one, split into commits by layer starting from Domain.
4. Write or update the unit tests first if the change touches Domain.
5. Write the implementation.
6. Run `pnpm typecheck:domain` before anything else — it's the fastest signal that the isolation is intact.
7. Run the full `pre-merge-check` gate.
8. Open the PR.

---

## 13. What you must never do

- Import `better-sqlite3` or `fs` from anywhere outside `apps/desktop/src/data/` or `apps/desktop/src/main/composition-root.ts`.
- Import React from `packages/domain/src/`.
- Hard delete a row.
- Introduce a plan check outside `packages/domain/src/plans/` or `PlanPolicy`.
- Ship a user-facing string without both `fr` and `ar` translations.
- Use `pl-*` / `pr-*` / `ml-*` / `mr-*` — always logical properties.
- Add a third-party UI library alongside shadcn/ui.
- Cast to `any` or `unknown as X` in application code (tests may cast in very narrow, commented cases).
- Copy-paste a domain entity into the renderer. If both need the shape, it belongs in `packages/domain/src/entities/` and is imported from there.
- Skip a skill because "the change is small". Small changes are where bugs hide.
- Hard-code Moroccan lunar holiday dates (Eid, etc.) in the code or in a static file. The admin enters them each year through the Holidays screen.
- Compute a Hijri calendar on the client. If the product ever needs it, we integrate a maintained library — we do not roll our own.
- Auto-execute a teacher payout. Payouts are always proposed by `TeacherPayoutCalculator` and confirmed by a human before becoming a `TeacherPayout` in status `paid`.
- Mutate a `TeacherPayout` that is `paid`. Corrections are reversal entries, never in-place edits.
- Bill anything per session. All billing is monthly — student subscriptions to formulas, and teacher payouts. Holidays never affect invoice amounts.
- Edit the `monthlyPrice` or `subjectIds` on a `Formula` that has any historical invoice line. Create a new Formula and deactivate the old one instead.
- Edit an active `StudentSubscription` in place to change formulas mid-course. Close it (`endMonth`) and open a new one.
- Delete a `Subject` that is referenced by any Formula or Group. Deactivate it (`active = false`) instead — `SubjectInUseError` guards this.
- Allow a student to hold two active regular subscriptions or two active exam-prep subscriptions at the same time — the domain rejects it as `TooManyActiveSubscriptionsError`.
- Enroll a student in a Group whose `kind` doesn't match one of the student's active subscription kinds. `CrossKindEnrollmentError` guards this.
- Show exam-prep sessions in a list or calendar view without a `kind` badge and filter. Exam-prep must always be visually and logically separable from regular.
- Put groups on the invoice. Invoices list formulas, not groups.
- Resolve a sync conflict automatically by wall-clock timestamp. Timestamps inform the human; `version` counters and the retry loop decide ordering. A laptop with a broken clock must never silently overwrite real data.
- Auto-resolve a delete-vs-edit conflict in either direction. It always goes to its own tab in the popup.
- Put conflict-resolution or merge logic in the hub or in a data adapter. The hub is a dumb versioned mailbox; resolution lives in `packages/domain/src/sync`, merges in domain use cases (`MergeParents`, `MergeStudents`).
- Implement peer-to-peer laptop sync, or sync via a shared folder / Dropbox. Hub-and-spoke only — the hub enforces version checks atomically.
- Special-case the hub laptop. Its local replica syncs to its own embedded hub over localhost through the same `SyncHubPort` as every other device.
- Match student duplicates before parent duplicates. Dedup order is parents (phone E.164 anchor) → students (name + parentId) → dependents.
- Store invoice `status` as an editable scalar. Status is derived from append-only `Payment` records.
- Mix data from two centers in one SQLite file, one sync scope, or one matching key. Center = tenant, always. One encrypted DB file per center.
- Store a timestamp generated outside the `Clock` port, or in local time. UTC via the injected clock, everywhere.
- Ship a DB file without SQLCipher encryption, or an Electron window without `contextIsolation` / with `nodeIntegration`.
- Create a plan-specific or platform-specific branch. One monorepo, one codebase; plans and platforms are configuration + adapters.

---

## 14. Definition of done

A change is done when:

- [ ] It belongs in exactly one layer, or is split across commits per layer.
- [ ] `pnpm typecheck:domain && pnpm typecheck && pnpm lint` is clean.
- [ ] Unit tests cover every new business path (happy, error, plan-locked, limit-exceeded where relevant).
- [ ] If it touches a user flow: an E2E test exists and passes in both FR-LTR and AR-RTL.
- [ ] Every new string is present in `fr.json` and `ar.json`.
- [ ] Every new gated feature has a flag in `plans.ts` and a `useFeature` guard in the UI.
- [ ] Every new entity has the full envelope: ULID `id`, `centerCode`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt`, `deviceOrigin`, `version`, and (if people-like) `naturalKey`.
- [ ] If the change touches sync: resolution logic is in `packages/domain/src/sync` (not the hub, not adapters), no wall-clock auto-resolution, delete-vs-edit reaches the dedicated tab, and there are tests for pull→resolve→push including a rejected push + retry.
- [ ] If the change touches payments: `Payment` rows are append-only and invoice status is derived, never written.
- [ ] If the change is center-scoped, it never reads or writes across `centreId` boundaries; cross-center features live behind `org.multi-center` and target the cloud tier.
- [ ] If the change touches scheduling, `SessionConflictPolicy` still enforces center hours, holidays, and kind isolation, and there are tests for each rejection case.
- [ ] If the change touches invoicing, invoices are generated per `StudentSubscription` (formula-based, monthly). No per-session or per-group billing.
- [ ] If the change touches a `Formula` or `Subject`, immutability-after-use and soft-delete-only rules are honored.
- [ ] If the change touches enrollments, `CrossKindEnrollmentError` and `TooManyActiveSubscriptionsError` guards are in place and tested.
- [ ] If the change touches teacher payroll, only `fixed-monthly` and `percentage-of-monthly-fees` rule types exist; `paid` payouts remain immutable; reversals are separate entries.
- [ ] If the change adds a report/dashboard KPI, it can be filtered by `kind` (regular vs exam-prep) at the query level.
- [ ] `pnpm build && pnpm test:e2e` passes locally.
- [ ] The self-review from the `code-review` skill has been completed and pasted in the PR description.

If any box is unchecked, the PR is not ready.

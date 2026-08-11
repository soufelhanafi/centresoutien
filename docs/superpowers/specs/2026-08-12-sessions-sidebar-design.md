# SOU-178 — Sessions Sidebar (view all + inline edit) — Design

**Status:** Approved (brainstorm) — ready for implementation plan
**Date:** 2026-08-12
**Epic:** SOU-10 — Scheduling
**Related:** SOU-175 (session form: sheet → centered dialog)

---

## 1. Goal

A slide-in sidebar (drawer) the user opens from the planner to see **all recurring
weekly sessions (templates)** and edit them inline — full fields, time included —
without hunting week-by-week in the grid.

---

## 2. Decisions locked in brainstorm

| Decision | Choice |
|---|---|
| Surface | **Slide-in `Sheet` drawer** with **inline editing** inside it (not the centered dialog). User chose this over reusing the SOU-175 dialog. |
| What it lists | **Recurring weekly templates** (`WeeklyRecurringSession`), not concrete dated occurrences. Finite, small list. |
| Inline fields | **All editable session fields** — via reuse of the existing `SessionForm`, not a bespoke editor. |
| Edit path | Existing `weeklySession.update` channel (already runs the SOU-55 composite conflict check: room + teacher + hours). |

**Consistency note (SOU-175):** SOU-175 moved the session *form* off a sheet into a
centered dialog for consistency. This drawer is a *browse-and-manage* surface, not
the create/edit dialog — a different job. The distinction is deliberate and
documented here so the two aren't read as contradictory.

**Explicitly out of scope (YAGNI):**
- **Re-materializing already-generated future occurrences** when a template's time
  changes. Concrete dated `Session` rows come from `session.generate` /
  `session.generator.commit`; editing a template does not retroactively move rows
  already materialized. The drawer shows a short inline note to that effect; actual
  regeneration/reconciliation is a separate concern (SOU-201 territory). No auto-regen.
- Editing individual concrete occurrences (user chose templates).
- Filtering/pagination — the template list is small; a flat weekday-grouped list is enough.

---

## 3. Architecture

Two layers, split into commits: **Domain+Data** (new read seam) then **Presentation**
(the drawer). No new entity, no migration, no sync/plan-gating change beyond reusing
the existing `core.calendar.week` gate.

### 3.1 Domain + Data — list-all-templates read seam

There is no "list all templates" channel today (`session.week` is week-scoped). Add one,
mirroring the existing enriched `session.week` read model.

- **Use case** `ListWeeklyRecurringSessions` in `packages/domain/src/use-cases/`:
  returns all **active** (non-soft-deleted) `WeeklyRecurringSession` for the center,
  each enriched with display names for group / subject / room / teacher (the same join
  `session.week` already resolves). Gated `core.calendar.week` via `PlanPolicy.require`.
- **Read port:** add `listAllActive(centerCode)` to the enriched read model
  `packages/domain/src/ports/weekly-session-view-read-port.ts` (the same read-model
  port `session.week` uses for its group/subject/room/teacher join), implemented by its
  SQLite adapter. Read-only; excludes soft-deleted (`deletedAt`) and inactive templates.
  The write repo (`weekly-recurring-session-repository.ts`) is untouched.
- **View DTO:** a `weeklyRecurringSessionListItemView` (Zod) in the contract — id,
  weekday, start/end `HH:mm`, validity window, plus resolved group/subject/room/teacher
  names + ids (ids so the edit form can seed selects).
- **IPC channel** `weeklySession.list`: empty request (`centerCode` injected in main,
  never sent from renderer); response `{ sessions: weeklyRecurringSessionListItemView[] }`.
  Wire in `composition-root.ts` + the IPC dispatcher.
- **Unit tests** (domain): happy path (returns enriched, sorted by weekday then start),
  plan-locked (`core.calendar.week` missing → `PlanFeatureUnavailableError`), soft-deleted
  excluded, empty state.

### 3.2 Presentation — the drawer

- **Gateway:** extend the planner gateway with `listWeeklyTemplates()` → the new channel
  (mirror `IpcPlannerGateway.listWeek`), plus a mock for renderer tests.
- **Hook:** `use-weekly-templates.ts` (TanStack Query) reading the gateway. Invalidated
  by the existing update/delete mutation hooks so the list refreshes after an edit.
- **Component `all-sessions-drawer.tsx`:** a `Sheet` (from `@centresoutien/ui`) opened by a
  new planner-toolbar button ("Toutes les séances"). Body = templates grouped by weekday;
  each row shows time + group/subject/room/teacher and expands (accordion) to reveal the
  **existing `SessionForm`** seeded from that template, wired to `use-update-session`
  (`weeklySession.update`). On submit: conflict errors surface via the existing
  `session-conflict-alert`; on success invalidate the templates list **and** `session.week`
  (grid stays in sync). A row action cancels the template via `weeklySession.delete`
  (soft-cancel), with a confirm.
- **Regen note:** a small inline `<p>` (bilingual) in the drawer header explaining that
  changing a time affects future *generation*, and already-planned dates need a regenerate.
- Each new component stays under the size ceiling — the drawer composes a
  `weekday-group` list and a `template-row` (row + expandable form), not one large file.
- FR/AR strings in `fr.json` + `ar.json`; RTL-safe (logical props, `Sheet` is
  direction-aware); directional chevrons use `rtl:` mirroring.

---

## 4. Data flow

```
Planner toolbar button → open Sheet
  → use-weekly-templates (TanStack Query) → planner gateway.listWeeklyTemplates()
    → IPC weeklySession.list → ListWeeklyRecurringSessions use case → repo.listAllActive
  → drawer renders weekday groups → row expand → SessionForm (seeded)
    → submit → use-update-session → weeklySession.update
        ├─ conflict → session-conflict-alert (SOU-55 error)
        └─ ok → invalidate [weekly-templates, session.week] → list + grid refresh
  → row cancel → weeklySession.delete (soft) → same invalidation
```

---

## 5. Files

**Domain / Data (commit 1)**
- Add: `packages/domain/src/use-cases/list-weekly-recurring-sessions.ts`
- Add: `listAllActive` on `packages/domain/src/ports/weekly-session-view-read-port.ts` (enriched read model)
- Add: adapter method implementing it (the SQLite adapter behind `weekly-session-view-read-port`, the same one serving `session.week`)
- Edit: `apps/desktop/src/shared/ipc/contract.ts` (view schema + `weeklySession.list` channel)
- Edit: `apps/desktop/src/main/composition-root.ts` + IPC dispatcher/handlers (wire the use case)
- Add: `packages/domain/tests/unit/use-cases/list-weekly-recurring-sessions.test.ts`

**Presentation (commit 2)**
- Edit: `apps/desktop/src/renderer/lib/planning/planner-gateway.ts` (+ ipc + mock) — `listWeeklyTemplates`
- Add: `apps/desktop/src/renderer/hooks/planning/use-weekly-templates.ts`
- Add: `apps/desktop/src/renderer/components/planning/all-sessions-drawer.tsx`
- Add: `apps/desktop/src/renderer/components/planning/all-sessions-row.tsx` (row + expandable `SessionForm`)
- Edit: `apps/desktop/src/renderer/components/planning/planner-toolbar.tsx` (open button)
- Edit: `apps/desktop/src/renderer/i18n/fr.json` + `ar.json` (drawer strings + regen note)
- Reuse (no change): `SessionForm`, `use-update-session`, `use-cancel-session`/`weeklySession.delete`,
  `session-conflict-alert`, `use-session-form-options`.

---

## 6. Testing

- **Domain unit:** the four `ListWeeklyRecurringSessions` cases (happy/enriched/sorted,
  plan-locked, soft-deleted-excluded, empty).
- **Data integration:** repo `listAllActive` returns active-only, enriched join correct.
- **Renderer unit:** drawer renders grouped rows from a mock gateway; expanding a row shows
  the form seeded from the template; submit calls the update mutation; conflict error renders
  the alert. Both FR and AR (RTL) mount.
- **E2E:** not added — this is a management convenience over existing, already-E2E-covered
  session write paths; per the e2e-testing skill E2E is reserved for critical money/data-loss
  flows. Manual check in both locales before merge.

---

## 7. Risks / notes

- **Regeneration expectation.** The biggest user-facing subtlety: editing a template's time
  does not move already-materialized future dates. Mitigated by the inline note; a real
  "regenerate future from here" action is deferred (overlaps SOU-201). Confirm the note copy
  reads clearly in both locales.
- **Drawer vs SOU-175.** Reintroduces a sheet surface; justified as browse-and-manage, not the
  edit form. Documented in §2 so review doesn't read it as a regression.
- **List channel naming.** `weeklySession.list` sits beside the existing `weeklySession.create/
  update/delete` — consistent namespace, no `session.week` overlap (that stays week-scoped).

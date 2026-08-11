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
| Surface | **Slide-in `Sheet` drawer** with **inline editing** inside it (not the centered dialog). |
| What it lists | **Recurring weekly templates** (`WeeklyRecurringSession`), not concrete dated occurrences. |
| Inline fields | **All editable session fields** — via reuse of the existing `SessionForm`. |
| Edit path | Existing `weeklySession.update` (already runs the SOU-55 composite conflict check: room + teacher + hours). |

**Consistency note (SOU-175):** SOU-175 moved the session *form* off a sheet into a
centered dialog for consistency. This drawer is a *browse-and-manage* surface, not the
create/edit dialog — a different job. Documented so the two aren't read as contradictory.

**Explicitly out of scope (YAGNI):**
- **Re-materializing already-generated future occurrences** when a template's time
  changes. Concrete dated `Session` rows come from `session.generate` /
  `session.generator.commit`; editing a template does not retroactively move rows
  already materialized. The drawer shows a short inline note; regeneration is a
  separate concern (SOU-201 territory). No auto-regen.
- Editing individual concrete occurrences (user chose templates).
- Filtering/pagination — the list is small; a flat weekday-grouped list is enough.

---

## 3. Architecture — **presentation only**

> **Scope correction (during planning):** the enriched read the drawer needs —
> *all active recurring templates, joined with room/teacher/subject names* — is
> **exactly what the existing `session.week` channel already returns.** The planner
> grid is a generic recurring-week view: `useWeekSessions()` → `PlannerSessionView[]`
> is one row per active `WeeklyRecurringSession`, enriched, ordered by weekday then
> start. So **no new use case, read port, adapter, or IPC channel is needed** — the
> original §3.1 "new read seam" was redundant. SOU-178 is entirely in the renderer.
> `packages/domain` and the data layer are untouched.

The session form edits exactly six fields — `dayOfWeek, start, end, roomId, teacherId,
groupId` (`sessionFormSchema`; validity window / `active` are wire defaults filled by
the IPC adapter, not user-editable) — and `PlannerSessionView` carries all six. So a
row can seed `SessionForm` directly from the week data with no extra fetch.

### 3.1 Reuse map (nothing new in domain/data)

| Need | Existing piece reused |
|---|---|
| List all templates enriched | `useWeekSessions()` → `plannerGateway.listWeek()` → `session.week` |
| Row → form seed | `toFormInput(view)` (currently private in `session-template-dialog.tsx`) |
| Form fields | `SessionForm` (`formId`, `defaultValues`, `options`, `onSubmit`) |
| Picker options | `useSessionFormOptions()` |
| Save (with conflict check) | `useUpdateSession(id)` → `weeklySession.update`; `toSessionInput(values)` |
| Conflict display | `SessionConflictAlert({ codes })` + `mapSessionWriteError(error)` |
| Cancel (soft-delete) | `useCancelSession(id)` → `weeklySession.delete` + `CancelSessionDialog` |
| Drawer primitive | `Sheet` family from `@centresoutien/ui` |

### 3.2 New renderer code (units)

1. **Share the `toFormInput` mapper** — it currently lives private inside
   `session-template-dialog.tsx`. Move it to `lib/planning/session-view-to-form.ts`
   and have the dialog import it. Small, safe, and the one genuinely-shared bit of
   view→form logic. **The dialog's edit orchestration is NOT extracted** — the drawer
   row owns its own (this is the 2nd instance; the repo's DRY rule sets the extraction
   threshold at 3 copies, and the post-success UX differs — close dialog vs collapse row).
2. **`all-sessions-row.tsx`** — a row (time + group/subject/room/teacher) that expands to
   render `SessionForm` inline, wiring `useUpdateSession` / `useCancelSession` /
   `useSessionFormOptions` / `mapSessionWriteError` directly (same shape as the dialog),
   with `SessionConflictAlert` above the fields, a save button, and a cancel action via
   `CancelSessionDialog`. Seeds the form via the shared `toFormInput`. On save success,
   collapse the row; `useUpdateSession` already invalidates `plannerKeys.all`, so the grid
   and the drawer list refresh together.
3. **`all-sessions-drawer.tsx`** — a `Sheet` opened from a new planner-toolbar button
   ("Toutes les séances"). Loads `useWeekSessions()`, groups rows by weekday, shows the
   bilingual regen note in the header, and handles empty/loading. Composes the rows;
   stays under the size ceiling by keeping the weekday-group rendering small.

All new user-facing strings in `fr.json` + `ar.json`; RTL-safe (logical props, `Sheet`
is direction-aware, chevrons mirrored with `rtl:`). Existing keys reused where present
(`planning.form.*`, `planning.cancelSession.*`, `planning.conflict.*`, `errors.*`, and
the existing weekday labels).

---

## 4. Data flow

```
Planner toolbar button → open Sheet
  → useWeekSessions() → plannerGateway.listWeek() → session.week   (all active templates, enriched)
  → drawer groups rows by weekday → row expand → SessionForm (seeded via toFormInput)
    → submit → useSessionEdit.submit → useUpdateSession → weeklySession.update
        ├─ conflict → mapSessionWriteError → SessionConflictAlert
        └─ ok → invalidate plannerKeys.all → grid + drawer list refresh → collapse row
  → row cancel → CancelSessionDialog → useCancelSession → weeklySession.delete (soft) → same invalidation
```

---

## 5. Files

**All in `apps/desktop/src/renderer` — no domain/data/IPC changes.**

- Add: `lib/planning/session-view-to-form.ts` (shared `toFormInput` mapper)
- Edit: `components/planning/session-template-dialog.tsx` (import the shared mapper — behavior unchanged)
- Add: `components/planning/all-sessions-row.tsx` (row + expandable inline `SessionForm` + own orchestration)
- Add: `components/planning/all-sessions-drawer.tsx` (the `Sheet` + weekday grouping + regen note)
- Edit: `components/planning/planner-toolbar.tsx` (open button)
- Edit: `i18n/fr.json` + `i18n/ar.json` (drawer strings + regen note)
- Add tests: `tests/renderer/planning/all-sessions-drawer.test.tsx` (+ row coverage)
- Reuse unchanged: `SessionForm`, `SessionConflictAlert`, `useUpdateSession`,
  `useCancelSession`, `useSessionFormOptions`, `useWeekSessions`, `CancelSessionDialog`,
  `toFormInput`/`toSessionInput`, `mapSessionWriteError`.

---

## 6. Testing

- **Renderer unit (`--project renderer`, jsdom):**
  - Drawer renders rows grouped by weekday from a mocked `plannerGateway.listWeek`.
  - Expanding a row shows `SessionForm` seeded from that template (day/time/room prefilled).
  - Submitting calls the update mutation with the mapped input.
  - A thrown scheduling error renders `SessionConflictAlert` (no toast).
  - Empty state renders when there are no templates.
  - Mounts in both FR and AR (RTL).
  - `SessionTemplateDialog`'s existing test still passes after the hook extraction.
- **No domain/data tests** — nothing changes in those layers.
- **No E2E** — management convenience over already-E2E-covered session write paths
  (per the e2e-testing skill, E2E is reserved for critical money/data-loss flows).
  Manual check in both locales before merge.

---

## 7. Risks / notes

- **Regeneration expectation.** Editing a template's time does not move already-materialized
  future dates. Mitigated by the inline note; a real "regenerate future" action is deferred
  (overlaps SOU-201). Confirm the note copy reads clearly in both locales.
- **Row orchestration duplicates the dialog's** (2nd copy, within the repo's 3-copy DRY
  threshold; post-success UX genuinely differs). Only the `toFormInput` mapper is shared.
  Revisit extraction if a 3rd caller appears.
- **Drawer vs SOU-175.** Reintroduces a sheet surface, justified as browse-and-manage (not
  the edit form) — documented in §2 so review doesn't read it as a regression.

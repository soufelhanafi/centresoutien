# Sessions Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A slide-in drawer, opened from the planner, listing all recurring weekly sessions grouped by weekday, each expandable to edit its fields inline (with conflict handling) or cancel it.

**Architecture:** Presentation-only in `apps/desktop/src/renderer`. Reuses the existing `session.week` read (which already returns all active templates enriched), `SessionForm`, `SessionConflictAlert`, `useUpdateSession`/`useCancelSession`, and the existing weekday labels. No `packages/domain`, data, or IPC change.

**Tech Stack:** React 19, react-i18next, TanStack Query, shadcn `Sheet` (via `@centresoutien/ui`), Vitest + Testing Library (jsdom `renderer` project).

## Global Constraints

- **Presentation-only.** Do NOT touch `packages/domain`, the data layer, or `contract.ts`. No new IPC channel — reuse `session.week` via `useWeekSessions()`.
- **No `any`, no `@ts-ignore`.** TS strict. No comment that restates a well-named symbol.
- **i18n parity:** every new string in BOTH `apps/desktop/src/renderer/i18n/fr.json` AND `ar.json`, identical key paths. No hardcoded user-facing strings.
- **RTL-safe:** logical Tailwind props only (`ps-*`/`pe-*`/`ms-*`/`me-*`/`text-start`); directional chevrons mirrored with `rtl:`. `Sheet` is already direction-aware.
- **Reuse, don't reinvent:** weekday labels are `t(`planning.weekdays.${day}`)` iterating `WEEKDAYS` from `@centresoutien/domain`. Form seeding uses the shared `toFormInput`. Conflict codes render via `SessionConflictAlert`. Cancel confirm via `CancelSessionDialog`.
- **Editable fields are exactly six** (`sessionFormSchema`): `dayOfWeek, start, end, roomId, teacherId, groupId`. Validity window / `active` are not user-editable.
- **Verify commands** (from repo root; if vitest errors on a missing `@tailwindcss/postcss` from apps/landing, run `pnpm install` once — known workspace gap):
  - typecheck: `pnpm --filter @centresoutien/desktop typecheck`
  - renderer tests: `pnpm exec vitest run --project renderer`
  - lint changed files: `pnpm exec eslint <files>`
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7
  ```

---

### Task 1: Share the `toFormInput` mapper

Move the private `toFormInput` out of `session-template-dialog.tsx` into a shared module so the new drawer row can seed `SessionForm` from a `PlannerSessionView` without duplicating it.

**Files:**
- Create: `apps/desktop/src/renderer/lib/planning/session-view-to-form.ts`
- Modify: `apps/desktop/src/renderer/components/planning/session-template-dialog.tsx`

**Interfaces:**
- Produces: `toFormInput(session: PlannerSessionView): SessionFormInput`

- [ ] **Step 1: Create the shared mapper**

```ts
// apps/desktop/src/renderer/lib/planning/session-view-to-form.ts
import type { PlannerSessionView } from './planner-view';
import type { SessionFormInput } from './session-form-schema';

// Weekday index → the Radix Select's string value, keyed by the DTO's numeric day.
const DAY_FIELD_VALUES = ['0', '1', '2', '3', '4', '5', '6'] as const;

// Maps an enriched planner read row back to the six editable form fields.
export function toFormInput(session: PlannerSessionView): SessionFormInput {
  return {
    dayOfWeek: DAY_FIELD_VALUES[session.dayOfWeek] ?? '0',
    start: session.start,
    end: session.end,
    roomId: session.roomId,
    teacherId: session.teacherId,
    groupId: session.groupId,
  };
}
```

- [ ] **Step 2: Use it in the dialog**

In `apps/desktop/src/renderer/components/planning/session-template-dialog.tsx`:
- Delete the local `DAY_FIELD_VALUES` const and the local `toFormInput` function (lines defining them).
- Add the import near the other `../../lib/planning/...` imports:

```ts
import { toFormInput } from '../../lib/planning/session-view-to-form';
```

Leave every other line (the `toFormInput(session)` call site, mutations, JSX) unchanged.

- [ ] **Step 3: Verify typecheck + renderer tests**

Run: `pnpm --filter @centresoutien/desktop typecheck`
Expected: PASS.
Run: `pnpm exec vitest run --project renderer`
Expected: PASS (no behavior changed; the dialog still seeds the same values).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/planning/session-view-to-form.ts apps/desktop/src/renderer/components/planning/session-template-dialog.tsx
git commit -m "refactor(SOU-178): extract shared toFormInput session mapper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 2: All-sessions drawer row (inline edit + cancel)

A single row: collapsed shows the template summary; expanded renders `SessionForm` inline with conflict handling and a cancel action.

**Files:**
- Create: `apps/desktop/src/renderer/components/planning/all-sessions-row.tsx`
- Test: `apps/desktop/tests/renderer/planning/all-sessions-row.test.tsx`

**Interfaces:**
- Consumes: `toFormInput` (Task 1); `PlannerSessionView`; `SessionForm`, `SessionConflictAlert`, `CancelSessionDialog`; `useUpdateSession`, `useCancelSession`, `useSessionFormOptions`; `toSessionInput`, `mapSessionWriteError`.
- Produces: `AllSessionsRow({ session }: { session: PlannerSessionView }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/tests/renderer/planning/all-sessions-row.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/renderer/i18n/config';
import { AllSessionsRow } from '../../../src/renderer/components/planning/all-sessions-row';
import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';

const updateMock = vi.fn();
vi.mock('../../../src/renderer/lib/planning/session-write-gateway', () => ({
  sessionWriteGateway: {
    update: (id: string, input: unknown) => updateMock(id, input),
    cancel: vi.fn(),
  },
}));
vi.mock('../../../src/renderer/hooks/planning/use-session-form-options', () => ({
  useSessionFormOptions: () => ({
    data: { rooms: [{ id: 'rom_1', name: 'Salle 1' }], teachers: [], groups: [] },
  }),
}));

const session: PlannerSessionView = {
  id: 'wrs_1',
  dayOfWeek: 1,
  start: '09:00',
  end: '10:00',
  roomId: 'rom_1',
  roomName: 'Salle 1',
  teacherId: null,
  teacherName: null,
  groupId: null,
  subjectId: null,
  subjectName: null,
  level: null,
  kind: 'regular',
};

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AllSessionsRow session={session} />
    </QueryClientProvider>,
  );
}

describe('AllSessionsRow', () => {
  beforeEach(() => {
    updateMock.mockReset();
    void i18n.changeLanguage('fr');
  });

  it('shows the template summary collapsed and reveals the form on expand', async () => {
    renderRow();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /modifier|edit|09:00/i }));
    await waitFor(() => expect(screen.getByLabelText(/début|start/i)).toBeInTheDocument());
  });

  it('submits the mapped input through the update gateway', async () => {
    updateMock.mockResolvedValue({ id: 'wrs_1' });
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: /modifier|edit|09:00/i }));
    await waitFor(() => screen.getByLabelText(/début|start/i));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer|save/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('wrs_1', expect.objectContaining({ start: '09:00' })));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project renderer all-sessions-row`
Expected: FAIL — `AllSessionsRow` module not found.

- [ ] **Step 3: Implement the row**

```tsx
// apps/desktop/src/renderer/components/planning/all-sessions-row.tsx
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { SessionForm } from './session-form';
import { SessionConflictAlert } from './session-conflict-alert';
import { CancelSessionDialog } from './cancel-session-dialog';
import { useUpdateSession } from '../../hooks/planning/use-update-session';
import { useCancelSession } from '../../hooks/planning/use-cancel-session';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { toFormInput } from '../../lib/planning/session-view-to-form';
import { toSessionInput, type SessionFormValues } from '../../lib/planning/session-form-schema';
import { mapSessionWriteError, type SessionWriteErrorCode } from '../../lib/planning/session-write-error';
import type { PlannerSessionView } from '../../lib/planning/planner-view';

function summaryLabel(session: PlannerSessionView, subjectFallback: string): string {
  const subject = session.subjectName?.fr ?? subjectFallback;
  return `${session.start}–${session.end} · ${subject}`;
}

export function AllSessionsRow({ session }: { session: PlannerSessionView }) {
  const { t } = useTranslation();
  const formId = useId();
  const [expanded, setExpanded] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [errorCodes, setErrorCodes] = useState<readonly SessionWriteErrorCode[]>([]);
  const update = useUpdateSession(session.id);
  const cancel = useCancelSession(session.id);
  const options = useSessionFormOptions();

  const handleSubmit = async (values: SessionFormValues) => {
    setErrorCodes([]);
    try {
      await update.mutateAsync(toSessionInput(values));
      toast.success(t('planning.form.editSuccess'));
      setExpanded(false);
    } catch (error) {
      const code = mapSessionWriteError(error);
      if (code) setErrorCodes([code]);
      else toast.error(t('planning.form.error'));
    }
  };

  const handleCancelSession = async () => {
    try {
      await cancel.mutateAsync();
      toast.success(t('planning.cancelSession.success'));
      setConfirmingCancel(false);
    } catch {
      toast.error(t('planning.cancelSession.error'));
    }
  };

  return (
    <li className="rounded-lg border border-border">
      <Button
        type="button"
        variant="ghost"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="truncate">{summaryLabel(session, t('planning.allSessions.noSubject'))}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="truncate">{session.roomName ?? t('planning.allSessions.noRoom')}</span>
          <ChevronDown
            className={expanded ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'}
            aria-hidden="true"
          />
        </span>
      </Button>

      {expanded ? (
        <div className="space-y-4 border-t border-border p-3">
          <SessionConflictAlert codes={errorCodes} />
          {options.data ? (
            <SessionForm
              formId={formId}
              defaultValues={toFormInput(session)}
              options={options.data}
              onSubmit={handleSubmit}
            />
          ) : null}
          <div className="flex items-center justify-between">
            <Button type="button" variant="destructive" onClick={() => setConfirmingCancel(true)}>
              {t('planning.cancelSession.trigger')}
            </Button>
            <Button type="submit" form={formId} disabled={update.isPending || !options.data}>
              {update.isPending ? t('planning.form.saving') : t('planning.form.save')}
            </Button>
          </div>
        </div>
      ) : null}

      <CancelSessionDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        onConfirm={handleCancelSession}
        pending={cancel.isPending}
      />
    </li>
  );
}
```

Note: the `<Button>` summary carries the visible `HH:mm` text, so the test's `name: /09:00/` regex matches it; keep the times in that button.

- [ ] **Step 4: Add the two new i18n keys used here**

Add to `apps/desktop/src/renderer/i18n/fr.json` inside the existing `"planning"` object (create the `"allSessions"` sub-object; the drawer keys land here too in Task 3):

```json
    "allSessions": {
      "noSubject": "Sans matière",
      "noRoom": "Sans salle"
    },
```

Add the SAME keys to `apps/desktop/src/renderer/i18n/ar.json`:

```json
    "allSessions": {
      "noSubject": "بدون مادة",
      "noRoom": "بدون قاعة"
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer all-sessions-row`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm --filter @centresoutien/desktop typecheck`
Run: `pnpm exec eslint apps/desktop/src/renderer/components/planning/all-sessions-row.tsx`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/components/planning/all-sessions-row.tsx apps/desktop/tests/renderer/planning/all-sessions-row.test.tsx apps/desktop/src/renderer/i18n/fr.json apps/desktop/src/renderer/i18n/ar.json
git commit -m "feat(SOU-178): all-sessions drawer row with inline edit + cancel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

### Task 3: All-sessions drawer + toolbar trigger

The `Sheet` that lists all templates grouped by weekday, with the regen note, wired to a planner-toolbar button.

**Files:**
- Create: `apps/desktop/src/renderer/components/planning/all-sessions-drawer.tsx`
- Modify: `apps/desktop/src/renderer/components/planning/planner-toolbar.tsx`
- Modify: `apps/desktop/src/renderer/i18n/fr.json`, `apps/desktop/src/renderer/i18n/ar.json`
- Test: `apps/desktop/tests/renderer/planning/all-sessions-drawer.test.tsx`

**Interfaces:**
- Consumes: `useWeekSessions()` → `PlannerSessionView[]`; `AllSessionsRow` (Task 2); `WEEKDAYS` from `@centresoutien/domain`; `Sheet*` from `@centresoutien/ui`.
- Produces: `AllSessionsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/tests/renderer/planning/all-sessions-drawer.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/renderer/i18n/config';
import { AllSessionsDrawer } from '../../../src/renderer/components/planning/all-sessions-drawer';
import type { PlannerSessionView } from '../../../src/renderer/lib/planning/planner-view';

const sessions: PlannerSessionView[] = [
  { id: 'wrs_1', dayOfWeek: 1, start: '09:00', end: '10:00', roomId: 'rom_1', roomName: 'Salle 1', teacherId: null, teacherName: null, groupId: null, subjectId: null, subjectName: { fr: 'Maths', ar: 'رياضيات' }, level: null, kind: 'regular' },
  { id: 'wrs_2', dayOfWeek: 3, start: '11:00', end: '12:00', roomId: 'rom_2', roomName: 'Salle 2', teacherId: null, teacherName: null, groupId: null, subjectId: null, subjectName: { fr: 'Physique', ar: 'فيزياء' }, level: null, kind: 'regular' },
];

vi.mock('../../../src/renderer/lib/planning/planner-gateway', () => ({
  plannerGateway: { listWeek: () => Promise.resolve(sessions) },
}));
vi.mock('../../../src/renderer/hooks/planning/use-session-form-options', () => ({
  useSessionFormOptions: () => ({ data: { rooms: [], teachers: [], groups: [] } }),
}));

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AllSessionsDrawer open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('AllSessionsDrawer', () => {
  beforeEach(() => { void i18n.changeLanguage('fr'); });

  it('lists sessions grouped by weekday', async () => {
    renderDrawer();
    expect(await screen.findByText(/Maths/)).toBeInTheDocument();
    expect(screen.getByText(/Physique/)).toBeInTheDocument();
    expect(screen.getByText('Lundi')).toBeInTheDocument();
    expect(screen.getByText('Mercredi')).toBeInTheDocument();
  });

  it('renders the regeneration note', async () => {
    renderDrawer();
    expect(await screen.findByText(/génération|regénér|futures/i)).toBeInTheDocument();
  });

  it('mounts in Arabic (RTL)', async () => {
    await i18n.changeLanguage('ar');
    renderDrawer();
    expect(await screen.findByText(/رياضيات/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project renderer all-sessions-drawer`
Expected: FAIL — `AllSessionsDrawer` module not found.

- [ ] **Step 3: Implement the drawer**

```tsx
// apps/desktop/src/renderer/components/planning/all-sessions-drawer.tsx
import { useTranslation } from 'react-i18next';
import { WEEKDAYS, type WeekdayIndex } from '@centresoutien/domain';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@centresoutien/ui';
import { useWeekSessions } from '../../hooks/planning/use-week-sessions';
import { AllSessionsRow } from './all-sessions-row';
import type { PlannerSessionView } from '../../lib/planning/planner-view';

function groupByWeekday(
  sessions: readonly PlannerSessionView[],
): ReadonlyArray<{ day: WeekdayIndex; rows: readonly PlannerSessionView[] }> {
  return WEEKDAYS.map((day) => ({
    day,
    rows: sessions
      .filter((session) => session.dayOfWeek === day)
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start)),
  })).filter((group) => group.rows.length > 0);
}

export function AllSessionsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useWeekSessions();
  const groups = groupByWeekday(data ?? []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('planning.allSessions.title')}</SheetTitle>
          <SheetDescription>{t('planning.allSessions.regenNote')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('planning.allSessions.empty')}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.day} className="space-y-2">
                <h3 className="text-sm font-semibold">{t(`planning.weekdays.${group.day}`)}</h3>
                <ul className="space-y-2">
                  {group.rows.map((session) => (
                    <AllSessionsRow key={session.id} session={session} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Add the drawer i18n keys**

Extend the `"planning.allSessions"` object in `apps/desktop/src/renderer/i18n/fr.json` (keep the `noSubject`/`noRoom` from Task 2):

```json
    "allSessions": {
      "noSubject": "Sans matière",
      "noRoom": "Sans salle",
      "open": "Toutes les séances",
      "title": "Toutes les séances",
      "regenNote": "Modifier l'heure d'une séance affecte les prochaines générations ; les dates déjà planifiées doivent être régénérées.",
      "empty": "Aucune séance hebdomadaire pour le moment."
    },
```

Same keys in `apps/desktop/src/renderer/i18n/ar.json`:

```json
    "allSessions": {
      "noSubject": "بدون مادة",
      "noRoom": "بدون قاعة",
      "open": "كل الحصص",
      "title": "كل الحصص",
      "regenNote": "تغيير وقت حصة يؤثر على التوليدات القادمة؛ التواريخ المجدولة مسبقًا يجب إعادة توليدها.",
      "empty": "لا توجد حصص أسبوعية حاليًا."
    },
```

- [ ] **Step 5: Wire the toolbar open button**

In `apps/desktop/src/renderer/components/planning/planner-toolbar.tsx`, add local open state and the drawer. Add imports:

```tsx
import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { AllSessionsDrawer } from './all-sessions-drawer';
```

Inside the toolbar component, add state and render a button + the drawer (place the button alongside the other toolbar actions; the exact JSX position follows the file's existing action group):

```tsx
  const [allSessionsOpen, setAllSessionsOpen] = useState(false);
```

```tsx
      <Button type="button" variant="outline" onClick={() => setAllSessionsOpen(true)}>
        <CalendarRange className="me-2 h-4 w-4" aria-hidden="true" />
        {t('planning.allSessions.open')}
      </Button>
      <AllSessionsDrawer open={allSessionsOpen} onOpenChange={setAllSessionsOpen} />
```

(If `t` / `useTranslation` isn't already in the toolbar, it is — the file imports `react-i18next` at line 1; use the existing `t`.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run --project renderer all-sessions-drawer`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify typecheck + lint + full renderer suite**

Run: `pnpm --filter @centresoutien/desktop typecheck`
Run: `pnpm exec eslint apps/desktop/src/renderer/components/planning/all-sessions-drawer.tsx apps/desktop/src/renderer/components/planning/planner-toolbar.tsx`
Run: `pnpm exec vitest run --project renderer`
Expected: all clean/green.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/components/planning/all-sessions-drawer.tsx apps/desktop/src/renderer/components/planning/planner-toolbar.tsx apps/desktop/src/renderer/i18n/fr.json apps/desktop/src/renderer/i18n/ar.json apps/desktop/tests/renderer/planning/all-sessions-drawer.test.tsx
git commit -m "feat(SOU-178): all-sessions drawer grouped by weekday + toolbar trigger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ZYFfBvw6nmDepBThQQKb7"
```

---

## Pre-merge gate

- [ ] `pnpm --filter @centresoutien/desktop typecheck` — clean
- [ ] `pnpm exec vitest run --project renderer` — green (new row + drawer tests included; existing planning tests unaffected)
- [ ] `pnpm lint` (root) — 0 warnings
- [ ] i18n parity: every `planning.allSessions.*` key present in both `fr.json` and `ar.json`
- [ ] Manual check in FR-LTR and AR-RTL: open the drawer from the planner toolbar, expand a row, change a time → save (conflict shows inline on a clash), cancel a template
- [ ] Run the `pre-merge-check` skill before opening the PR

## Notes for the implementer

- **No domain/data/IPC changes** — if you find yourself editing `packages/domain`, `apps/desktop/src/data`, or `contract.ts`, stop: the data already exists via `session.week`.
- The row test mocks `sessionWriteGateway` and `useSessionFormOptions`; the drawer test mocks `plannerGateway.listWeek`. Follow the existing renderer-test mocking style in `apps/desktop/tests/renderer/planning/`.
- Keep each new file under the component-size ceiling; `groupByWeekday` is a pure helper kept beside the drawer.

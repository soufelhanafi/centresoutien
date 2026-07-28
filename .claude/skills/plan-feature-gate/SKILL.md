---
name: plan-feature-gate
description: Add, remove, gate, or move features across the Centre Soutien plans (Essentiel / Pro / Premium) using a single source of truth in the domain layer and the standard `useFeature` hook in the UI. Use this skill whenever adding any feature that should not be in every plan; whenever changing which plan owns a feature; whenever bumping a limit (max students, teachers, rooms); whenever the phrase "premium only", "pro only", "gated", "locked", "upgrade", "license", or "plan" appears in a task; and whenever wiring a lock overlay in the UI. Trigger even on small edits that touch `packages/domain/src/plans/` or that add a "PRO" or "PREMIUM" badge to any component. Err on the side of triggering — an incorrectly gated feature is either a revenue leak or a customer complaint.
---

# Plan / Feature Gating — Centre Soutien Desktop

The application ships as one binary. Plans are runtime configuration, not build-time. Every plan check flows through one policy in the domain layer so we cannot accidentally leave a hole.

---

## The three rules that make this work

1. **Domain is the source of truth.** Every gated code path calls `PlanPolicy.require('feature.name')` at the top. If the plan lacks the feature, the use case throws `PlanFeatureUnavailableError` and returns nothing. UI hiding is cosmetic. Only the domain check protects revenue. On desktop this is honest-user enforcement (a local binary can be patched — accepted); the same flags MUST be re-enforced server-side in `apps/api` for cloud sync and the web SaaS. Never design a flag that only the client can check.
2. **UI hides via feature flags, never plan names.** A component asks `useFeature('planning.random-auto')`. It never asks `usePlan()` and compares to `'pro'`. This makes moving a feature between plans a one-line change.
3. **`plans.ts` is the only file that names plans.** If you `grep -R "essentiel"` in the repo and find matches outside `packages/domain/src/plans/` (excluding tests, translations, and analytics event names), that's a bug.

---

## Step 1 — Add or move a feature: the file that changes

The registry:

```ts
// packages/domain/src/plans/plans.ts
export type PlanId = 'essentiel' | 'pro' | 'premium';

export type FeatureFlag =
  // core (in every plan)
  | 'core.rooms'
  | 'core.teachers'
  | 'core.students'
  | 'core.parents'
  | 'core.groups'
  | 'core.calendar.week'
  | 'core.invoicing'
  // pro
  | 'core.invoicing.partial-paid'
  | 'core.invoice-template.customize'
  | 'io.excel.export'
  | 'io.excel.import'
  | 'io.excel.sync'
  | 'planning.custom-grid'
  // premium
  | 'planning.random-auto'
  | 'sync.multi-device'
  | 'sync.cloud'
  | 'sync.conflict-resolution'   // per-user permission: who may settle sync conflicts
  | 'org.multi-center'           // cross-center consolidated views (cloud-only)
  | 'limits.students.unlimited'
  | 'limits.teachers.unlimited';

const essentiel: Plan = {
  id: 'essentiel',
  features: new Set<FeatureFlag>([
    'core.rooms', 'core.teachers', 'core.students', 'core.groups',
    'core.calendar.week', 'core.invoicing',
  ]),
  limits: { maxStudents: 50, maxTeachers: 2, maxRooms: 1 },
};

const pro: Plan = {
  id: 'pro',
  features: new Set<FeatureFlag>([
    ...essentiel.features,
    'core.parents',
    'core.invoicing.partial-paid',
    'core.invoice-template.customize',
    'io.excel.export', 'io.excel.import', 'io.excel.sync',
    'planning.custom-grid',
  ]),
  limits: { maxStudents: 300, maxTeachers: 10, maxRooms: 5 },
};

const premium: Plan = {
  id: 'premium',
  features: new Set<FeatureFlag>([
    ...pro.features,
    'planning.random-auto',
    'sync.multi-device', 'sync.cloud', 'sync.conflict-resolution',
    'org.multi-center',
    'limits.students.unlimited', 'limits.teachers.unlimited',
  ]),
  limits: { maxStudents: 'unlimited', maxTeachers: 'unlimited', maxRooms: 'unlimited' },
};

export const PLANS: Readonly<Record<PlanId, Plan>> = { essentiel, pro, premium };
```

**Naming rules for flags:**

- Dotted lowercase, kebab-case in segments.
- First segment is the domain family: `core`, `planning`, `io`, `sync`, `org`, `payroll`, `settings`, `dashboard`, `limits`, `analytics`, `notifications`.
- Second segment (and beyond) is the feature.
- Verbs OK when unambiguous (`planning.random-auto`).
- Never encode the plan into the name (`planning.random-auto`, not `premium.auto-planner`) — the whole point is decoupling.

---

## Step 2 — The policy — one class, one throw

```ts
// packages/domain/src/plans/plan-policy.ts
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../errors/plan-errors';
import type { FeatureFlag, Plan, PlanLimits } from './plans';

export class PlanPolicy {
  constructor(private readonly plan: Plan) {}

  has(feature: FeatureFlag): boolean {
    return this.plan.features.has(feature);
  }

  require(feature: FeatureFlag): void {
    if (!this.has(feature)) throw new PlanFeatureUnavailableError(feature, this.plan.id);
  }

  limit<K extends keyof PlanLimits>(key: K): PlanLimits[K] {
    return this.plan.limits[key];
  }

  requireBelowLimit(key: keyof PlanLimits, current: number): void {
    const cap = this.limit(key);
    if (cap === 'unlimited') return;
    if (current >= cap) throw new PlanLimitExceededError(key, cap, current);
  }
}
```

That's the whole enforcement surface. No conditions scattered anywhere else.

---

## Step 3 — Use-case usage — always at the top

```ts
// packages/domain/src/use-cases/generate-monthly-invoices.ts
export class GenerateMonthlyInvoices {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly plan: PlanPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(input: { month: string }) {
    this.plan.require('core.invoicing'); // always require the base feature
    // …
  }
}

// packages/domain/src/use-cases/create-student.ts
export class CreateStudent {
  async execute(input: CreateStudentInput) {
    this.plan.require('core.students');
    const currentCount = await this.students.countActive(input.centerCode);
    this.plan.requireBelowLimit('maxStudents', currentCount);
    // …
  }
}
```

The gate is the first thing the use case does, before validation, before I/O.

---

## Step 4 — UI usage — the `useFeature` hook and the lock overlay

```ts
// apps/desktop/src/renderer/hooks/use-feature.ts
export function useFeature(flag: FeatureFlag): boolean {
  const plan = usePlanStore((s) => s.plan);
  return plan.features.has(flag);
}
```

Then, everywhere:

```tsx
export function CalendarPage() {
  const canAutoPlan = useFeature('planning.random-auto');
  const canCustomGrid = useFeature('planning.custom-grid');

  return (
    <>
      <PageHeader />
      <Toolbar>
        <Button disabled={!canAutoPlan} onClick={openAutoPlan}>
          {t('calendar.autoPlan')}
          {!canAutoPlan && <PlanBadge required="premium" />}
        </Button>
        {canCustomGrid ? <CustomGridToggle /> : <PlanLockPill required="pro" />}
      </Toolbar>
      {canAutoPlan ? <AutoPlanDrawer /> : null}
    </>
  );
}
```

Never write `plan.id === 'premium'` in a component. Never. If you're tempted, the fix is to add a flag.

### The three standard visual treatments

Everywhere in the UI, gated features use one of exactly three treatments — no bespoke variants:

1. **Inline badge**: a small `PRO` or `PREMIUM` pill next to the label. Feature is visible and disabled, tooltip shows the CTA.
2. **Locked pill / overlay**: the feature's area is replaced by a locked pill with the plan name and a "Voir les plans" CTA.
3. **Full-screen lock**: reserved for entire pages (e.g., "Synchronisation" on Essentiel).

The components live in `apps/desktop/src/renderer/components/plan-lock/`. Reuse them.

---

## Step 5 — Reading the active plan at startup

Where does the active plan come from?

- Production: from the license file (validated, cached) or from a locally stored plan-id after a successful license activation.
- Dev: from a `--plan=` CLI flag or an env var read only when `NODE_ENV !== 'production'`.
- E2E: from the test's `--plan=` fixture flag.

The composition root reads it once, constructs the `PlanPolicy`, and passes it into every use case. Plan changes require an app restart (this is intentional — mid-session plan changes are a whole class of bugs we don't need).

---

## Step 6 — Testing plan gating

For every gated use case, unit-test:

- **The lock**: on a plan without the feature, `execute()` rejects with `PlanFeatureUnavailableError`.
- **The unlock**: on a plan with the feature, `execute()` proceeds and succeeds.
- **The limit**: on a plan with a numeric limit, adding the last allowed item succeeds, and the next one throws `PlanLimitExceededError`.

For every gated UI area, E2E-test on at least two plans:

- One where it's locked (assert disabled, tooltip / lock overlay).
- One where it's unlocked (assert it works end-to-end).

See the `e2e-testing` skill for the parameterized pattern.

---

## Step 7 — Moving a feature between plans

Because everything routes through `plans.ts`, moving `planning.custom-grid` from Pro to Essentiel is:

```ts
// before
essentiel.features = new Set([..., ]);
pro.features = new Set([..., 'planning.custom-grid']);

// after
essentiel.features = new Set([..., 'planning.custom-grid']);
pro.features = new Set([..., ]); // (still inherits via ...essentiel.features)
```

Then update:

- Marketing copy on the landing page and the setup wizard's plan comparison table.
- Any E2E test that expected the feature to be locked on Essentiel.
- Changelog.

No other code changes. If there are others, something bypassed the policy.

---

## Step 8 — Adding a limit

Limits are a special kind of gate: they're counted at write time.

```ts
this.plan.requireBelowLimit('maxStudents', await this.students.countActive(centerCode));
```

Every limit needs:

- A field in `PlanLimits`.
- A value per plan (`number | 'unlimited'`).
- A use-case call to `requireBelowLimit`.
- A UI hint before the ceiling ("Il vous reste 12 places sur Essentiel") — soft nudge, not just a hard block at the ceiling.
- An E2E test that fills to the ceiling on Essentiel and verifies the next add is blocked with the upgrade CTA.

---

## Step 9 — Analytics (when we add it)

When a gated call is blocked, emit a domain event: `feature_blocked { flag, plan, action }`. This is what tells product which locks convert users to upgrades. The event lives in the domain (as an `EventBus` port); adapters send it wherever we track events.

Do this now with a stub port even if no analytics adapter exists yet — retrofitting it later means going back through every gate.

---

## Common mistakes and their fix

| Mistake | Fix |
|---|---|
| `if (plan.id === 'premium') { ... }` in a use case. | Replace with `this.plan.require('feature.name')`. |
| `if (plan === 'premium')` in a component. | Replace with `useFeature('feature.name')`. |
| A feature added without an entry in `plans.ts`. | Add the flag; the linter's exhaustiveness check on the union should catch it. |
| A limit checked in the UI only. | Move the check to the use case; the UI is only for UX. |
| Two use cases with copy-pasted plan checks. | Both should call `PlanPolicy` — the checks are one line each. |
| A gated feature with no test on the locked plan. | Add the E2E case. Every gate needs both sides tested. |
| A feature moved between plans by editing a component. | Revert. Move it in `plans.ts` and only in `plans.ts`. |

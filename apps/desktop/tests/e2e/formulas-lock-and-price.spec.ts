import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoFormulas, pageCrashed, type Launched, type Locale } from './formulas.fixtures';

/**
 * SOU-62 — Formulas CRUD UI: locked (immutable) state.
 *
 * Targets the hard invariant CLAUDE.md calls out explicitly: an immutable
 * (already-invoiced) Formula's price/subjects can never be edited through the
 * UI — only a new Formula + deactivate is allowed. Critical-only per SOU-142:
 * the invalid-input (zero/negative price) and clone-editable variants dropped
 * here are Zod-schema-level concerns, unit-tested instead.
 *
 * IMPORTANT — this scenario is BLOCKED in this build, not skipped for
 * convenience: `isImmutable` is flipped only by a data-layer trigger the first
 * time an `InvoiceLine` references the Formula (see `packages/domain/src/
 * entities/formula.ts`). There is no `invoice.*` channel in
 * `apps/desktop/src/shared/ipc/contract.ts` yet (Invoicing is still a
 * `ModulePlaceholder` on the router), so nothing reachable through the
 * packaged app — UI or public IPC bridge — can put a Formula into the
 * invoiced/immutable state. Left as `test.fixme` (near-zero runtime cost) so
 * it activates the moment an invoice-creation IPC channel exists.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: { id: string; nameFr: string; nameAr: string }[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات' };
const MATH_SEUL = { nameFr: 'Math seul', nameAr: 'رياضيات فقط', subjectIdxs: [0], priceMad: 200 };

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Formulas page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

test.describe('AC2/AC3 — immutable (invoiced) Formula lock', () => {
  test.fixme(
    true,
    'BLOCKED: no invoice.* IPC channel exists in this build to reference a Formula from an ' +
      'InvoiceLine, so isImmutable can never become true through the packaged app. Unblock once ' +
      'invoicing ships an IPC surface, then remove this .fixme.',
  );

  test('an immutable formula locks price/subjects for editing but stays deactivatable', async () => {
    const loc = locale();
    const L = STR[loc];
    live = await boot(loc, { subjects: [MATH], formulas: [MATH_SEUL] });
    await gotoFormulas(live.win, L);
    await assertMounted(live.win, L);

    // There is currently no way to seed an invoiced (isImmutable: true) Formula
    // through the public bridge — this scenario cannot be executed today.
  });
});

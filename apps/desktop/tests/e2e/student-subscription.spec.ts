import { test, expect } from '@playwright/test';
import {
  STR,
  boot,
  pageCrashed,
  createStudentAndOpenDetail,
  gotoSubscriptionTab,
  seedStudentWithSubscription,
  seedFormula,
  formulaName,
  currentMonth,
  tryCreateSubscription,
  fakeFormulaId,
  type Launched,
  type Locale,
} from './student-subscription.fixtures';

/**
 * SOU-65 — Student detail: subscription state (Active + History tabs) and the
 * close-and-reopen "Change subscription" wizard. Black-box, driven only
 * through the running packaged app. Runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are the true happy path (subscribe
 * then change formula, against real Formulas) and the hard invariant
 * `TooManyActiveSubscriptionsError` — CLAUDE.md's explicit rule that a student
 * cannot hold two active regular subscriptions at once. Empty-state
 * rendering, graceful-degradation-with-zero-formulas, kind isolation, the
 * settled close-and-reopen history rendering, Essentiel exam-prep-card
 * hiding, and RTL are lower blast-radius and better covered at the
 * unit/component level.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const YASSINE = { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' };

async function assertMounted(win: Launched['win'], L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('tab', { name: L.detailTabs.enrollment })).toBeVisible();
}

/** Escapes regex metacharacters so a formula name (e.g. "Maths + Physique") can be
 *  used as a literal substring match in `getByText`/`getByRole` name matchers. */
function escapeRegExp(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

// ---------------------------------------------------------------------------
// Scenario 2 — HAPPY PATH as described by the acceptance criteria: an admin
// subscribes a student to a real formula, then uses "Changer de formule" to
// move them to a new one, and expects to see the transition reflected in the
// Active card and History table.
// ---------------------------------------------------------------------------
test('Scenario 2 — HAPPY PATH: subscribe then change formula via the wizard', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const formulaA = { nameFr: 'Maths seul', nameAr: 'الرياضيات فقط', priceMad: 200 } as const;
  const formulaB = { nameFr: 'Maths + Physique', nameAr: 'الرياضيات + الفيزياء', priceMad: 350 } as const;
  await seedFormula(win, formulaA);
  await seedFormula(win, formulaB);

  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);

  // --- Subscribe: the regular-track card has no current subscription, so the
  // wizard opens in "subscribe" mode and defaults the start month to now.
  await win.getByRole('button', { name: L.active.subscribeCta }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.wizard.subscribeTitle)).toBeVisible();

  const combobox = dialog.getByRole('combobox', { name: L.wizard.formulaLabel }).or(dialog.getByRole('combobox').first());
  await expect(combobox, 'formula picker must be enabled/selectable now that real formulas exist').toBeEnabled({ timeout: 3000 });
  await combobox.click();
  await win.getByRole('option', { name: escapeRegExp(formulaName(locale(), formulaA)) }).click();
  await dialog.getByRole('button', { name: L.wizard.confirm }).click();
  await expect(dialog).toBeHidden();

  await expect(win.getByText(formulaName(locale(), formulaA)).first()).toBeVisible();

  // --- Change: pick the new formula and set its start month to the current
  // month. Close-and-reopen is atomic (SOU-141): the previous subscription's
  // end month is derived as the month before this start, so the new formula
  // takes effect immediately with no separate end-month step.
  await win.getByRole('button', { name: L.active.changeCta }).first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.wizard.changeTitle)).toBeVisible();
  await expect(dialog.getByText(formulaName(locale(), formulaA))).toBeVisible();

  await combobox.click();
  await win.getByRole('option', { name: escapeRegExp(formulaName(locale(), formulaB)) }).click();
  await dialog.locator('#subscription-start-month').fill(currentMonth());
  await dialog.getByRole('button', { name: L.wizard.confirm }).click();
  await expect(dialog).toBeHidden();

  await expect(win.getByText(formulaName(locale(), formulaB)).first()).toBeVisible();
  await expect(win.getByRole('heading', { name: L.history.heading })).toBeVisible();
  await expect(win.getByText(formulaName(locale(), formulaA))).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 5 — at-most-one-active-per-kind invariant: a second `regular`
// subscription overlapping an already-active one for the same student is
// rejected by the domain with `TooManyActiveSubscriptionsError`. Verified at
// the public IPC bridge (the same layer the wizard itself calls into), since
// the wizard's own UI path is blocked (Scenario 2).
// ---------------------------------------------------------------------------
test('Scenario 5 — TooManyActiveSubscriptionsError blocks a second overlapping active regular subscription', async () => {
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedStudentWithSubscription(win, { ...YASSINE, kind: 'regular', startMonth: '2026-08' });
  const err = await tryCreateSubscription(win, {
    studentId: seeded.studentId,
    formulaId: fakeFormulaId(),
    kind: 'regular',
    subjectIds: [seeded.subjectId],
    startMonth: '2026-08',
  });

  expect(err, 'a second overlapping active "regular" subscription must be rejected').not.toBeNull();
  expect(err).toContain('too-many-active-subscriptions');
});

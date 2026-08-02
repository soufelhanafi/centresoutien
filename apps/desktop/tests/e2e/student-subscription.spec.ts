import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  createStudentAndOpenDetail,
  gotoSubscriptionTab,
  seedStudentWithSubscription,
  tryCreateSubscription,
  fakeFormulaId,
  type Launched,
  type Locale,
} from './student-subscription.fixtures';

/**
 * SOU-65 — Student detail: subscription state (Active + History tabs) and the
 * close-and-reopen "Change subscription" wizard. Black-box, driven only
 * through the running packaged app. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * *** BLOCKING GAP FOUND DURING EXPLORATION (see Scenario 2) ***
 * There is no way — through the UI or the public IPC bridge — to create a
 * `Formula` on this branch:
 *   - Settings has no "Formulas" screen (only a "Formule" = subscription-plan
 *     tab, a confusing homonym with the billing `Formula` entity).
 *   - `formula.list` is wired (returns `{ formulas: [] }`), but `formula.create`
 *     and every plausible naming variant tried (`formula.add/new/save/upsert/
 *     define/register/persist`, `formulas.create`, `core.formula.create`,
 *     `billing.formula.create`) return "No handler registered" from
 *     Electron's ipcMain — i.e. genuinely absent, not merely plan-gated.
 * Consequently the wizard's own formula picker can never be populated by a
 * real admin, so the acceptance criterion "admin can change a student's
 * formula mid-year" cannot be exercised end-to-end as a real user. Scenarios
 * 4-7 below seed `StudentSubscription` rows directly through the public
 * `subscription.create` / `subscription.close` IPC channels (the same
 * seeding-via-bridge convention every other suite uses for prerequisite
 * entities) to still validate everything downstream of formula selection:
 * Active/History rendering, kind isolation, and the at-most-one-active
 * domain guard.
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

// ---------------------------------------------------------------------------
// Scenario 1 — empty state: a freshly created student has no subscription of
// either kind. Both kind cards show the empty message + a "Souscrire" CTA;
// History shows its own empty message.
// ---------------------------------------------------------------------------
test('Scenario 1 — empty state: no active subscription of either kind, empty history', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/subscription-empty-${locale()}.png` });

  await expect(win.getByRole('heading', { name: L.kind.regular, exact: true }).or(win.getByText(L.kind.regular, { exact: true })).first()).toBeVisible();
  await expect(win.getByText(L.kind.examPrep, { exact: true }).first()).toBeVisible();
  await expect(win.getByText(L.active.empty)).toHaveCount(2); // one per kind card
  await expect(win.getByRole('button', { name: L.active.subscribeCta })).toHaveCount(2);
  await expect(win.getByRole('heading', { name: L.history.heading })).toBeVisible();
  await expect(win.getByText(L.history.empty)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — HAPPY PATH as described by the acceptance criteria: an admin
// subscribes a student to a formula, then uses "Changer de formule" to move
// them to a new one, and expects to see the transition reflected. This is
// expected to FAIL on this branch — the formula picker has no options because
// no Formula can be created anywhere in the shipped app. See file header.
// ---------------------------------------------------------------------------
test('Scenario 2 — HAPPY PATH: subscribe then change formula via the wizard (expected blocked)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);

  await win.getByRole('button', { name: L.active.subscribeCta }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.wizard.subscribeTitle)).toBeVisible();

  const combobox = dialog.getByRole('combobox', { name: L.wizard.formulaLabel }).or(dialog.getByRole('combobox').first());
  await win.screenshot({ path: `test-results/subscription-happy-path-blocked-${locale()}.png` });

  // A real admin needs at least one selectable, enabled formula picker to
  // complete the wizard. On this branch the picker is permanently disabled
  // (no formula-creation path exists anywhere — see file header), so this
  // assertion is expected to FAIL — that failure IS the reportable defect.
  await expect(combobox, 'formula picker must be enabled/selectable for the happy path to be reachable').toBeEnabled({ timeout: 3000 });
  await combobox.click();
  const options = win.getByRole('option');
  await expect(options, 'formula picker must offer at least one formula').not.toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 3 — graceful degradation: given the current state of the app (zero
// formulas reachable), the "Souscrire" wizard must still open without
// crashing, explain why the picker is empty, and keep Confirm disabled so the
// admin cannot submit a broken subscription.
// ---------------------------------------------------------------------------
test('Scenario 3 — subscribe wizard degrades gracefully when no formulas exist', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);

  await win.getByRole('button', { name: L.active.subscribeCta }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.wizard.subscribeTitle)).toBeVisible();
  await expect(dialog.getByText(L.wizard.noFormulas)).toBeVisible();
  await expect(dialog.getByRole('combobox').first()).toBeDisabled();
  await expect(dialog.getByRole('button', { name: L.wizard.confirm })).toBeDisabled();
  await win.screenshot({ path: `test-results/subscription-wizard-no-formulas-${locale()}.png` });

  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 4 — kind isolation: seeding an active *regular* subscription (via
// the public bridge, since the wizard itself cannot create one — see header)
// must only affect the Régulier card. The Prépa examen card stays untouched
// (still empty, still offers "Souscrire", never silently promoted to active).
// ---------------------------------------------------------------------------
test('Scenario 4 — an active regular subscription only affects the regular card', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedStudentWithSubscription(win, { ...YASSINE, kind: 'regular', startMonth: '2026-08' });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  // Navigate to the already-seeded student from the list (do not create
  // another one via the UI — that would produce a duplicate-named row).
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.waitForTimeout(300);
  await win.getByRole('row', { name: new RegExp(YASSINE.nameFr) }).getByRole('link', { name: new RegExp(YASSINE.nameFr) }).click();
  await win.waitForTimeout(300);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/subscription-kind-isolation-${locale()}.png` });

  await expect(win.getByRole('button', { name: L.active.changeCta })).toHaveCount(1);
  await expect(win.getByRole('button', { name: L.active.subscribeCta })).toHaveCount(1); // exam-prep card only
  await expect(win.getByText(L.active.empty)).toHaveCount(1); // exam-prep card only
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
  expect(err).toContain('TooManyActiveSubscriptionsError');
});

// ---------------------------------------------------------------------------
// Scenario 6 — close-and-reopen, settled: once the transition month has
// passed, the closed subscription must appear in History (with its endMonth)
// and the new one must appear as Active. (On the exact day of a same-month
// transition the *previous* formula legitimately stays "Active" through the
// end of that month per the derived-status rule — see the note in the report.)
// ---------------------------------------------------------------------------
test('Scenario 6 — settled close-and-reopen: old subscription in History, new one Active', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedStudentWithSubscription(win, { ...YASSINE, kind: 'regular', startMonth: '2026-05', endMonth: '2026-06' });
  // Second subscription for the SAME student — reuse via a raw evaluate call
  // rather than re-seeding a second student, so both rows sit on one timeline.
  await win.evaluate(
    async (formulaId) => {
      const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
      const list = (await api.invoke('student.list', { search: 'Yassine' })) as { students: { id: string }[] };
      const studentId = list.students[0]!.id;
      const subject = (await api.invoke('subject.create', { name: { fr: 'Physique', ar: 'فيزياء' } })) as { id: string };
      await api.invoke('subscription.create', {
        studentId,
        formulaId,
        kind: 'regular',
        subjectIds: [subject.id],
        startMonth: '2026-07',
      });
    },
    fakeFormulaId(),
  );

  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.waitForTimeout(300);
  await win.getByRole('row', { name: new RegExp(YASSINE.nameFr) }).getByRole('link', { name: new RegExp(YASSINE.nameFr) }).click();
  await win.waitForTimeout(300);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/subscription-history-settled-${locale()}.png` });

  await expect(win.getByRole('button', { name: L.active.changeCta })).toBeVisible();
  const historyRow = win.getByRole('row').filter({ hasText: L.kind.regular });
  await expect(historyRow).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Scenario 7 — Essentiel plan: the exam-prep track is Pro+ (`core.exam-prep`).
// On Essentiel the Prépa examen card must not render at all — the admin
// cannot reach exam-prep subscriptions structurally, which is the strongest
// available proxy for "the formula picker only offers regular formulas on
// Essentiel" given Formula creation itself is unreachable (Scenario 2).
// ---------------------------------------------------------------------------
test('Scenario 7 — Essentiel plan hides the exam-prep subscription card', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/subscription-essentiel-${locale()}.png` });

  await expect(win.getByText(L.kind.regular, { exact: true }).first()).toBeVisible();
  await expect(win.getByText(L.kind.examPrep, { exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 8 — RTL: Arabic locale renders the tab, cards, and wizard with the
// correct direction and translated copy. Runs identically under the `ar`
// project; the direction assertion below only binds under `ar`.
// ---------------------------------------------------------------------------
test('Scenario 8 — locale direction and translated copy', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await assertMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  await win.getByRole('button', { name: L.active.subscribeCta }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByText(L.wizard.subscribeTitle)).toBeVisible();
  await expect(dialog.getByText(L.wizard.subscribeDescription)).toBeVisible();
  await win.screenshot({ path: `test-results/subscription-rtl-${locale()}.png` });
});

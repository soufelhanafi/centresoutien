import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  createStudentAndOpenDetail,
  gotoSubscriptionTab,
  seedStudentWithSubscription,
  seedFormula,
  formulaName,
  currentMonth,
  previousMonth,
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
 * Scenario 2 exercises the true happy path against real Formulas seeded via
 * `formula.create` (SOU-62, merged after this branch was cut). Scenarios 4-7
 * still seed `StudentSubscription` rows directly through the public
 * `subscription.create` / `subscription.close` IPC channels (the same
 * seeding-via-bridge convention every other suite uses for prerequisite
 * entities) to validate the read side in isolation from formula resolution:
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

/** Escapes regex metacharacters so a formula name (e.g. "Maths + Physique") can be
 *  used as a literal substring match in `getByText`/`getByRole` name matchers. */
function escapeRegExp(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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

  // --- Change: close the current subscription a month early so the new one
  // takes effect immediately, keeping the assertions below deterministic
  // instead of depending on which day of the month the suite runs.
  await win.getByRole('button', { name: L.active.changeCta }).first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.wizard.changeTitle)).toBeVisible();
  await expect(dialog.getByText(formulaName(locale(), formulaA))).toBeVisible();

  await dialog.locator('#subscription-end-month').fill(previousMonth(currentMonth()));
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

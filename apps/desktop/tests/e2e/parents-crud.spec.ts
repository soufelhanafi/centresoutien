import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoParents, pageCrashed, type Launched, type Locale } from './parents.fixtures';

/**
 * SOU-41 — Parent (guardian) CRUD UI + detail sheet. Black-box, driven only
 * through the running packaged app. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are create-with-E.164-normalization
 * (the canonical top-level flow, and phone normalization is a real
 * cross-layer contract) and the same-name-children-under-different-fathers
 * case — this is the explicit CLAUDE.md dedup rule ("students by name +
 * parentId — two 'Yassine Alaoui' never have the same father"), a hard
 * data-integrity invariant. List rendering, empty states, phone-format
 * validation edge cases, edit, archive, and RTL are lower blast-radius and
 * better covered at the unit/component level.
 *
 * Agreed SOU-41 scope (tested here, nothing more):
 *   - Detail sheet shows a READ-ONLY list of the guardian's linked children +
 *     a "quick add NEW student pre-linked to this guardian" action.
 *   - Feature gated by `core.parents`, available on Essentiel (the default plan
 *     the suite boots with) — so it must be visible/usable in a normal run.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

type NewParent = { name: string; phone: string; relation?: 'pere' | 'mere' | 'tuteur' | 'autre'; email?: string };

/** Open the create sheet from the list, fill it, submit, assert success + closed. */
async function createParent(win: Page, L: (typeof STR)[Locale], p: NewParent): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.name, { exact: false }).fill(p.name);
  await dialog.getByLabel(L.form.phone, { exact: false }).fill(p.phone);
  if (p.email) await dialog.getByLabel(L.form.email, { exact: false }).fill(p.email);
  const relKey = p.relation ?? 'pere';
  await dialog.getByRole('combobox', { name: L.form.relation }).click();
  await win.getByRole('option', { name: L.relation[relKey], exact: true }).click();
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Open a parent's detail sheet by clicking their name button in the row. */
async function openDetail(win: Page, name: string): Promise<void> {
  await win.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name, exact: true }).click();
}

/** Assert the list page mounted without hitting the renderer error boundary. */
async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Parents page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — create a guardian (name + required phone), phone normalizes to
// E.164 (+212...), and the new row appears in the active list.
// ---------------------------------------------------------------------------
test('Scenario 1 — create a guardian; phone normalizes to E.164 and appears in the list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await win.screenshot({ path: `test-results/parents-created-${locale()}.png` });

  const row = win.getByRole('row', { name: /Ahmed Alaoui/ });
  await expect(row).toBeVisible();
  // Local Moroccan number 0612345678 must be stored/displayed as E.164 +212612345678.
  await expect(row).toContainText('+212612345678');
});

// ---------------------------------------------------------------------------
// Scenario 6 — two students created under DIFFERENT fathers with the SAME name
// must both be kept (never blocked as duplicates). Exercised via the quick-add
// flow from two distinct guardians.
// ---------------------------------------------------------------------------
test('Scenario 6 — same-name children under different fathers are both kept', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  // Father A + child "Yassine Alaoui".
  await createParent(win, L, { name: 'Karim Alaoui', phone: '0611111111', relation: 'pere' });
  await openDetail(win, 'Karim Alaoui');
  await win.getByRole('button', { name: L.detail.children.add }).click();
  let s = win.getByRole('dialog');
  await s.getByLabel(L.student.nameFr, { exact: false }).fill('Yassine Alaoui');
  await s.getByLabel(L.student.nameAr, { exact: false }).fill('ياسين العلوي');
  await s.getByLabel(L.student.birthDate, { exact: false }).fill('2010-05-14');
  await s.getByLabel(L.student.level, { exact: false }).fill('3AC');
  await s.getByRole('button', { name: L.student.create }).click();
  await expect(win.getByText(L.student.createSuccess).first()).toBeVisible();
  // Close the sheet back to the list.
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();

  // Father B (different phone) + a child with the SAME name.
  await createParent(win, L, { name: 'Rachid Alaoui', phone: '0622222222', relation: 'pere' });
  await openDetail(win, 'Rachid Alaoui');
  await win.getByRole('button', { name: L.detail.children.add }).click();
  s = win.getByRole('dialog');
  await s.getByLabel(L.student.nameFr, { exact: false }).fill('Yassine Alaoui');
  await s.getByLabel(L.student.nameAr, { exact: false }).fill('ياسين العلوي');
  await s.getByLabel(L.student.birthDate, { exact: false }).fill('2011-09-02');
  await s.getByLabel(L.student.level, { exact: false }).fill('2AC');
  await s.getByRole('button', { name: L.student.create }).click();

  // Must succeed — different father => not a duplicate. Child appears under B.
  await expect(win.getByText(L.student.createSuccess).first()).toBeVisible();
  await expect(win.getByRole('dialog').getByText('Yassine Alaoui')).toBeVisible();

  // And father A still has his own child (both people exist).
  await win.keyboard.press('Escape');
  await openDetail(win, 'Karim Alaoui');
  await expect(win.getByRole('dialog').getByText('Yassine Alaoui')).toBeVisible();
});

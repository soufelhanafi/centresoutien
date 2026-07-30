import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoParents, pageCrashed, type Launched, type Locale } from './parents.fixtures';

/**
 * SOU-41 — Parent (guardian) CRUD UI + detail sheet. Black-box, driven only
 * through the running packaged app. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test (Linear SOU-41):
 *   "Guardian list, detail sheet with linked children and quick 'add student'
 *    flow. Done when: admin can create/edit/archive guardians and see all their
 *    children in one place."
 *
 * Agreed SOU-41 scope (tested here, nothing more):
 *   - Parent list + create + edit + archive (soft delete). No restore UI.
 *   - Detail sheet shows a READ-ONLY list of the guardian's linked children +
 *     a "quick add NEW student pre-linked to this guardian" action.
 *   - Link/unlink of existing students + the student-side editor are SOU-42 and
 *     are NOT tested here.
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
// Scenario 0 — the list page renders (heading, subtitle, new button, search).
// Precondition for every other scenario; also proves core.parents is usable on
// the default Essentiel plan.
// ---------------------------------------------------------------------------
test('Scenario 0 — Parents list renders on Essentiel with header, search, new button', async () => {
  const L = STR[locale()];
  live = await boot(locale()); // default plan = essentiel
  const win = live.win;
  await gotoParents(win, L);
  await win.screenshot({ path: `test-results/parents-list-${locale()}.png` });

  await assertListMounted(win, L);
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn })).toBeVisible();
  await expect(win.getByLabel(L.searchLabel, { exact: false }).or(win.getByPlaceholder(L.search))).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 0b — empty state on a fresh center (no parents yet).
// ---------------------------------------------------------------------------
test('Scenario 0b — empty state shows when there are no parents', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await expect(win.getByText(L.empty.title)).toBeVisible();
  await expect(win.getByText(L.empty.body)).toBeVisible();
});

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
// Scenario 1b — empty phone is rejected (phone is required). The form stays open
// and a field error is shown; no parent is created.
// ---------------------------------------------------------------------------
test('Scenario 1b — empty phone is rejected', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Fill everything EXCEPT the phone.
  await dialog.getByLabel(L.form.name, { exact: false }).fill('Sans Téléphone');
  await dialog.getByRole('combobox', { name: L.form.relation }).click();
  await win.getByRole('option', { name: L.relation.pere, exact: true }).click();

  await dialog.getByRole('button', { name: L.form.create }).click();

  // A validation error appears for the empty phone (required or invalid-phone),
  // the sheet stays open, and no success toast fires.
  await expect(dialog.getByText(new RegExp(`${L.errors.required}|${L.errors.invalidPhone}`)).first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.form.createSuccess)).toHaveCount(0);
  await win.screenshot({ path: `test-results/parents-empty-phone-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 1c — a malformed / partial phone is rejected (does not silently
// create a bad E.164 number).
// ---------------------------------------------------------------------------
test('Scenario 1c — malformed phone is rejected', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.getByLabel(L.form.name, { exact: false }).fill('Numéro Cassé');
  await dialog.getByLabel(L.form.phone, { exact: false }).fill('12'); // too short to be a real MA number
  await dialog.getByRole('combobox', { name: L.form.relation }).click();
  await win.getByRole('option', { name: L.relation.pere, exact: true }).click();
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(dialog.getByText(new RegExp(`${L.errors.invalidPhone}|${L.errors.required}`)).first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.form.createSuccess)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 2 — edit a guardian; the change persists after reopening the sheet.
// ---------------------------------------------------------------------------
test('Scenario 2 — edit a guardian and the change persists after reopening', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });

  const row = win.getByRole('row', { name: /Ahmed Alaoui/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const nameField = dialog.getByLabel(L.form.name, { exact: false });
  await nameField.fill('Ahmed Alaoui Senior');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();

  // Reflected in the list.
  await expect(win.getByRole('row', { name: /Ahmed Alaoui Senior/ })).toBeVisible();

  // Reopen the edit sheet — the persisted value is loaded back.
  const row2 = win.getByRole('row', { name: /Ahmed Alaoui Senior/ });
  await row2.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();
  await expect(win.getByRole('dialog').getByLabel(L.form.name, { exact: false })).toHaveValue('Ahmed Alaoui Senior');
});

// ---------------------------------------------------------------------------
// Scenario 3 — archive a guardian; it leaves the active list.
// ---------------------------------------------------------------------------
test('Scenario 3 — archive a guardian removes it from the active list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });

  const row = win.getByRole('row', { name: /Ahmed Alaoui/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.archive }).click();

  const confirm = win.getByRole('alertdialog').or(win.getByRole('dialog'));
  await expect(confirm.getByText(L.archive.title)).toBeVisible();
  const confirmBtn = confirm.getByRole('button', { name: L.archive.confirm });
  await expect(confirmBtn).toBeVisible();

  // The confirm button must sit inside the viewport (RTL AlertDialogs have
  // historically overflowed off-screen — assert it crisply).
  const box = (await confirmBtn.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x, 'archive confirm button is within the viewport (not off-screen)').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);

  await confirmBtn.click();
  await expect(win.getByText(L.archive.success)).toBeVisible();
  await expect(win.getByRole('row', { name: /Ahmed Alaoui/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 4 — open the detail sheet; the linked-children panel renders with an
// empty state when the guardian has no children.
// ---------------------------------------------------------------------------
test('Scenario 4 — detail sheet shows the linked-children panel with empty state', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await openDetail(win, 'Ahmed Alaoui');

  const sheet = win.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ahmed Alaoui' })).toBeVisible();
  // Contact info shows the E.164 phone.
  await expect(sheet.getByText('+212612345678')).toBeVisible();
  // Children panel + empty state.
  await expect(sheet.getByText(L.detail.children.title, { exact: false }).first()).toBeVisible();
  await expect(sheet.getByText(L.detail.children.empty.title)).toBeVisible();
  await expect(sheet.getByText(L.detail.children.empty.body)).toBeVisible();
  await expect(sheet.getByRole('button', { name: L.detail.children.add })).toBeVisible();
  await win.screenshot({ path: `test-results/parents-detail-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — quick add-student flow from the detail sheet: create a NEW
// student here; the child then appears in this guardian's linked-children list.
// ---------------------------------------------------------------------------
test('Scenario 5 — quick add student from detail links the child to the guardian', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await openDetail(win, 'Ahmed Alaoui');

  await win.getByRole('button', { name: L.detail.children.add }).click();

  const studentSheet = win.getByRole('dialog');
  await expect(studentSheet).toBeVisible();
  await studentSheet.getByLabel(L.student.nameFr, { exact: false }).fill('Yassine Alaoui');
  await studentSheet.getByLabel(L.student.nameAr, { exact: false }).fill('ياسين العلوي');
  await studentSheet.getByLabel(L.student.birthDate, { exact: false }).fill('2010-05-14');
  await studentSheet.getByLabel(L.student.level, { exact: false }).fill('3AC');
  await studentSheet.getByRole('button', { name: L.student.create }).click();

  await expect(win.getByText(L.student.createSuccess).first()).toBeVisible();

  // Back on the guardian's detail sheet, the new child is now listed.
  const sheet = win.getByRole('dialog');
  await expect(sheet.getByText('Yassine Alaoui')).toBeVisible();
  await win.screenshot({ path: `test-results/parents-detail-child-${locale()}.png` });
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

// ---------------------------------------------------------------------------
// Scenario 7 — locale direction + RTL layout integrity on the parents page and
// the detail sheet: correct dir/lang, no horizontal overflow, sheet on the
// correct edge and fully within the viewport. Fully offline (the app never uses
// the network).
// ---------------------------------------------------------------------------
test('Scenario 7 — locale direction and RTL layout integrity (list + detail sheet)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoParents(win, L);
  await assertListMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  // No horizontal scroll on the parents list page.
  const listOverflow = await win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(listOverflow, 'parents list has no horizontal overflow').toBeLessThanOrEqual(1);

  // Header + primary action mirror with text direction.
  const heading = win.getByRole('heading', { level: 1, name: L.title });
  const newBtn = win.getByRole('button', { name: L.newBtn });
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(bBox.x, 'RTL → primary action sits left of the title').toBeLessThan(hBox.x);
  } else {
    expect(bBox.x, 'LTR → primary action sits right of the title').toBeGreaterThan(hBox.x);
  }

  // Open the detail sheet and assert it is fully within the viewport (no
  // off-screen dialog) and does not induce horizontal scroll.
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await openDetail(win, 'Ahmed Alaoui');
  const sheet = win.getByRole('dialog');
  await expect(sheet).toBeVisible();
  const sBox = (await sheet.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(sBox.x, 'detail sheet left edge within viewport').toBeGreaterThanOrEqual(-1);
  expect(sBox.x + sBox.width, 'detail sheet right edge within viewport').toBeLessThanOrEqual(vw + 1);

  const detailOverflow = await win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(detailOverflow, 'detail sheet does not cause horizontal overflow').toBeLessThanOrEqual(1);
  await win.screenshot({ path: `test-results/parents-direction-${locale()}.png` });
});

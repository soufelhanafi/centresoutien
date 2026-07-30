import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  gotoStudents,
  gotoParents,
  createStudent,
  createParent,
  openStudentGuardiansTab,
  openParentDetail,
  linkViaAutocomplete,
  clickUndo,
  pageCrashed,
  type Launched,
  type Locale,
} from './student-parent-linking.fixtures';

/**
 * SOU-42 — Student ↔ Parent linking UI (bidirectional). Black-box, driven only
 * through the running packaged app. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria (Linear SOU-42):
 *   "Admin can link/unlink parents ↔ students from either side without leaving
 *    the page. Add-existing (autocomplete) or create-new inline."
 *
 * Locked UX decisions asserted here:
 *   - Linking is an INLINE panel on the detail screens (student detail →
 *     "Responsables" tab; parent detail sheet → children list), never the full
 *     edit form.
 *   - Unlink is IMMEDIATE with an undo toast ("Lien supprimé" + "Annuler") that
 *     restores the link.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 0 — student-side guardians tab renders with its empty state (the
// precondition for the student side; also proves the tab is wired, not a stub).
// ---------------------------------------------------------------------------
test('Scenario 0 — student Responsables tab renders with empty state', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  expect(await pageCrashed(win), 'guardians tab rendered without the error boundary').toBe(false);
  await expect(win.getByText(L.guardians.empty.title)).toBeVisible();
  await expect(win.getByText(L.guardians.empty.body)).toBeVisible();
  // Both affordances are present: link-existing (autocomplete) + create-new inline.
  await expect(win.getByRole('button', { name: L.guardians.add })).toBeVisible();
  await expect(win.getByRole('button', { name: L.guardians.createNew })).toBeVisible();
  await win.screenshot({ path: `test-results/sou42-student-guardians-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 1 — STUDENT side, add-existing: open a student → Responsables tab →
// "Lier un responsable" autocomplete → pick an existing parent → it appears in
// the linked list; the empty state is gone (count updated). No page navigation.
// ---------------------------------------------------------------------------
test('Scenario 1 — student side: link an existing parent via autocomplete', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // Seed an existing parent.
  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });

  // Seed a student and open its Responsables tab.
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  const detailUrl = win.url();
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');

  // Success toast + linked row appears; empty state gone; still on the same page.
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.guardians.empty.title)).toHaveCount(0);
  expect(win.url(), 'linking did not navigate away from the student detail page').toBe(detailUrl);
  await win.screenshot({ path: `test-results/sou42-student-link-existing-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — STUDENT side, create-new inline: "Créer un responsable" → fill +
// save → the new parent is auto-linked to the student and shown in the list.
// ---------------------------------------------------------------------------
test('Scenario 2 — student side: create a new guardian inline; it is auto-linked', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  await win.getByRole('button', { name: L.guardians.createNew }).click();
  const sheet = win.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByLabel(L.parents.form.name, { exact: false }).fill('Ahmed Alaoui');
  await sheet.getByLabel(L.parents.form.phone, { exact: false }).fill('0612345678');
  await sheet.getByRole('combobox', { name: L.parents.form.relation }).click();
  await win.getByRole('option', { name: L.parents.relation.pere, exact: true }).click();
  await sheet.getByRole('button', { name: L.parents.form.create }).click();

  // New guardian is created AND auto-linked to the student.
  await expect(sheet).toBeHidden();
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.guardians.empty.title)).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou42-student-create-new-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — STUDENT side, unlink + undo: remove a guardian (✕) → row
// disappears immediately → undo toast ("Lien supprimé" + "Annuler") → click
// "Annuler" → the link is restored.
// ---------------------------------------------------------------------------
test('Scenario 3 — student side: unlink shows undo toast that restores the link', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();

  // Immediate unlink via the ✕ (aria-label "Retirer Ahmed Alaoui").
  await win.getByRole('button', { name: L.guardians.unlink('Ahmed Alaoui') }).click();
  await expect(win.getByText('Ahmed Alaoui')).toHaveCount(0);

  // Undo toast, then restore.
  await expect(win.getByText(L.guardians.unlinkSuccess).first()).toBeVisible();
  await clickUndo(win, L);
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou42-student-unlink-undo-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — PARENT side, add-existing: open a parent detail sheet →
// "Lier un élève" autocomplete → pick a student → appears in the children list.
// ---------------------------------------------------------------------------
test('Scenario 4 — parent side: link an existing student via autocomplete', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // Seed a student.
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  // Seed a parent and open its detail sheet.
  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');

  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');

  await expect(win.getByText(L.children.linkSuccess).first()).toBeVisible();
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.children.empty.title)).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou42-parent-link-existing-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — PARENT side, create-new child (existing SOU-41 flow) still works
// and pre-links the new student to this parent.
// ---------------------------------------------------------------------------
test('Scenario 5 — parent side: create-new child still works and pre-links', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');

  await win.getByRole('button', { name: L.children.add }).click();
  const studentSheet = win.getByRole('dialog').last();
  await studentSheet.getByLabel(L.students.form.nameFr, { exact: false }).fill('Yassine Alaoui');
  await studentSheet.getByLabel(L.students.form.nameAr, { exact: false }).fill('ياسين العلوي');
  await studentSheet.getByLabel(L.students.form.birthDate, { exact: false }).fill('2010-05-14');
  await studentSheet.getByLabel(L.students.form.level, { exact: false }).fill('3AC');
  await studentSheet.getByRole('button', { name: L.students.form.create }).click();

  await expect(win.getByText(L.students.form.createSuccess).first()).toBeVisible();
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou42-parent-create-child-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 6 — PARENT side, unlink + undo: remove a child (✕) → undo toast →
// restore.
// ---------------------------------------------------------------------------
test('Scenario 6 — parent side: unlink child shows undo toast that restores', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');
  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();

  await win.getByRole('button', { name: L.children.unlink('Yassine Alaoui') }).click();
  await expect(sheet.getByText('Yassine Alaoui')).toHaveCount(0);

  await expect(win.getByText(L.children.unlinkSuccess).first()).toBeVisible();
  await clickUndo(win, L);
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou42-parent-unlink-undo-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 7 — BIDIRECTIONAL consistency: a parent linked from the STUDENT side
// shows the student in that parent's children list (the other side).
// ---------------------------------------------------------------------------
test('Scenario 7 — a link made on the student side is reflected on the parent side', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  // Link on the student side.
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();

  // Now verify it on the parent side.
  await gotoParents(win, L);
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();
  await expect(sheet.getByText(L.children.empty.title)).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou42-bidirectional-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 8 — same-name students under DIFFERENT parents are never conflated:
// linking "Yassine Alaoui" to father A and a distinct "Yassine Alaoui" to
// father B keeps both links independent (no duplicate flag).
// ---------------------------------------------------------------------------
test('Scenario 8 — same-name students under different parents are linked independently', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // Two same-name-but-distinct students (distinct birth dates = distinct people).
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2012-11-03', level: '1AC' });

  // Two distinct fathers.
  await gotoParents(win, L);
  await createParent(win, L, { name: 'Karim Alaoui', phone: '0611111111', relation: 'pere' });
  await createParent(win, L, { name: 'Rachid Alaoui', phone: '0622222222', relation: 'pere' });

  // Father A links one "Yassine Alaoui".
  const sheetA = await openParentDetail(win, 'Karim Alaoui');
  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');
  await expect(sheetA.getByText('Yassine Alaoui').first()).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByRole('heading', { level: 1, name: L.parents.title })).toBeVisible();

  // Father B links a Yassine too — must be allowed (not blocked as duplicate).
  const sheetB = await openParentDetail(win, 'Rachid Alaoui');
  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');
  await expect(sheetB.getByText('Yassine Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.children.linkSuccess).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 9 — locale direction + RTL integrity of the inline link panels. The
// autocomplete popover and its options stay within the viewport (RTL popovers
// have historically overflowed off-screen). Fully offline (the app never uses
// the network).
// ---------------------------------------------------------------------------
test('Scenario 9 — RTL/LTR integrity of the inline link autocomplete', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  // Open the autocomplete and assert the search field is within the viewport.
  await win.getByRole('button', { name: L.guardians.add }).first().click();
  const search = win
    .getByPlaceholder(L.guardians.searchPlaceholder, { exact: false })
    .or(win.getByRole('combobox', { name: new RegExp(L.guardians.searchPlaceholder) }))
    .first();
  await expect(search).toBeVisible();
  const box = (await search.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x, 'autocomplete search left edge within viewport').toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, 'autocomplete search right edge within viewport').toBeLessThanOrEqual(vw + 1);

  // No horizontal overflow induced by the open panel.
  const overflow = await win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'open autocomplete does not cause horizontal overflow').toBeLessThanOrEqual(1);
  await win.screenshot({ path: `test-results/sou42-rtl-autocomplete-${locale()}.png` });
});

import { test, expect } from '@playwright/test';
import {
  STR,
  boot,
  gotoStudents,
  gotoParents,
  createStudent,
  createParent,
  openStudentGuardiansTab,
  openParentDetail,
  linkViaAutocomplete,
  clickUndo,
  type Launched,
  type Locale,
} from './student-parent-linking.fixtures';
import {
  STUDENT_FORM_STR,
  editStudentField,
  findStudentBySearch,
  getStudent,
  simulateConcurrentStudentEdit,
} from './student-set-guardians.fixtures';

/**
 * SOU-116 — `student.setGuardians` partial-update channel. Black-box, driven
 * only through the running packaged app (plus the public preload bridge for
 * setup/verification, never implementation). Runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test:
 *   1. Student-side link/unlink + success/undo toasts, undo restores.
 *   2. Parent-side link/unlink (reverse direction) — same UX.
 *   3. A guardian link/unlink must NOT revert unrelated student fields
 *      (name/level/notes/school) that changed out of band — the actual bug
 *      this ticket fixes (old code replayed the full StudentInput via
 *      `student.update` from a snapshot that could be stale after a sync
 *      pull or a concurrent edit).
 *   4. FR and AR/RTL parity.
 */

const locale = () => test.info().project.name as Locale;

/** The seeded niveau label the info tab renders after a level edit (localized). */
function niveauDisplayName(l: 'fr' | 'ar', code: string): string {
  const names: Record<string, { fr: string; ar: string }> = {
    '1AC': { fr: '1ère Année Collège', ar: 'السنة الأولى إعدادي' },
  };
  return names[code]![l === 'ar' ? 'ar' : 'fr']!;
}

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — student side: link an existing parent, unlink, undo restores it.
// ---------------------------------------------------------------------------
test('Scenario 1 — student side: link, unlink, and undo a guardian', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();

  await win.getByRole('button', { name: L.guardians.unlink('Ahmed Alaoui') }).click();
  await expect(win.getByText(L.guardians.unlinkSuccess).first()).toBeVisible();
  await expect(win.getByText(L.guardians.empty.title)).toBeVisible();
  await win.screenshot({ path: `test-results/sou116-student-unlink-${locale()}.png` });

  await clickUndo(win, L);
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.guardians.empty.title)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 2 — parent side (reverse direction): link an existing child,
// unlink, undo restores it. Same UX as the student side.
// ---------------------------------------------------------------------------
test('Scenario 2 — parent side: link, unlink, and undo a child', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  await gotoParents(win, L);
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');
  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');
  await expect(win.getByText(L.children.linkSuccess).first()).toBeVisible();
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();

  await sheet.getByRole('button', { name: L.children.unlink('Yassine Alaoui') }).click();
  await expect(win.getByText(L.children.unlinkSuccess).first()).toBeVisible();
  await expect(sheet.getByText(L.children.empty.title)).toBeVisible();
  await win.screenshot({ path: `test-results/sou116-parent-unlink-${locale()}.png` });

  await clickUndo(win, L);
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();
  await expect(sheet.getByText(L.children.empty.title)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 3 — THE bug fix: a guardian link performed from the STUDENT side
// must not revert a field that changed out of band (simulated sync
// pull / concurrent edit) between the guardian panel mounting and the link
// firing. Old code replayed the guardian panel's own (now-stale) snapshot of
// name/level/notes/school via `student.update`; the new `setGuardians`
// channel only ever touches `guardianIds`, so the out-of-band value must
// survive untouched.
// ---------------------------------------------------------------------------
test('Scenario 3a — student-side guardian link does not revert a concurrently-edited field', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  // Mount the guardian panel BEFORE the out-of-band edit lands, exactly the
  // ticket's stale-snapshot window.
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);
  const before = await findStudentBySearch(win, 'Yassine Alaoui');

  await simulateConcurrentStudentEdit(win, before, { notes: 'CONCURRENT_EDIT_NOTES' });

  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();

  const after = await getStudent(win, before.id);
  expect(after.notes, 'notes edited out-of-band must survive the guardian link').toBe('CONCURRENT_EDIT_NOTES');
  expect(after.guardianIds.length, 'the guardian link must still have gone through').toBe(1);
});

test('Scenario 3b — parent-side child link does not revert a concurrently-edited student field', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  const before = await findStudentBySearch(win, 'Yassine Alaoui');

  await gotoParents(win, L);
  const sheet = await openParentDetail(win, 'Ahmed Alaoui');

  await simulateConcurrentStudentEdit(win, before, { level: 'CONCURRENT_LEVEL' });

  await linkViaAutocomplete(win, L.children.linkExisting, L.children.searchPlaceholder, 'Yassine', 'Yassine Alaoui');
  await expect(win.getByText(L.children.linkSuccess).first()).toBeVisible();
  await expect(sheet.getByText('Yassine Alaoui').first()).toBeVisible();

  const after = await getStudent(win, before.id);
  expect(after.level, 'level edited out-of-band must survive the child link').toBe('CONCURRENT_LEVEL');
  expect(after.guardianIds.length, 'the child link must still have gone through').toBe(1);
});

test('Scenario 3c — an unlink does not revert a concurrently-edited student field', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();

  const before = await findStudentBySearch(win, 'Yassine Alaoui');
  await simulateConcurrentStudentEdit(win, before, { school: 'CONCURRENT_SCHOOL' });

  await win.getByRole('button', { name: L.guardians.unlink('Ahmed Alaoui') }).click();
  await expect(win.getByText(L.guardians.unlinkSuccess).first()).toBeVisible();

  const after = await getStudent(win, before.id);
  expect(after.school, 'school edited out-of-band must survive the guardian unlink').toBe('CONCURRENT_SCHOOL');
  expect(after.guardianIds.length, 'the unlink must still have gone through').toBe(0);
});

// ---------------------------------------------------------------------------
// Scenario 4 — the literal ticket repro, driven purely through the UI with no
// synthetic staleness: edit the Info tab, then immediately do a guardian
// action (and vice versa) — the edited/linked state must not be clobbered.
// ---------------------------------------------------------------------------
test('Scenario 4a — edit info tab then link a guardian: the edit is not reverted', async () => {
  const L = STR[locale()];
  const F = STUDENT_FORM_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  await win.getByRole('tab', { name: F.tabInfo }).click();
  await editStudentField(win, F, 'notes', 'EDITED_NOTES_BEFORE_LINK');

  await win.getByRole('tab', { name: L.guardians.tab }).click();
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();

  await win.getByRole('tab', { name: F.tabInfo }).click();
  await expect(win.getByText('EDITED_NOTES_BEFORE_LINK')).toBeVisible();
});

test('Scenario 4b — link a guardian then edit info tab: the link is not reverted', async () => {
  const L = STR[locale()];
  const F = STUDENT_FORM_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);

  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await expect(win.getByText(L.guardians.linkSuccess).first()).toBeVisible();

  await win.getByRole('tab', { name: F.tabInfo }).click();
  await editStudentField(win, F, 'level', '1AC');
  await expect(win.getByText(niveauDisplayName(locale(), '1AC'))).toBeVisible();

  await win.getByRole('tab', { name: L.guardians.tab }).click();
  await expect(win.getByText('Ahmed Alaoui').first()).toBeVisible();
  await expect(win.getByText(L.guardians.empty.title)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 5 — AR/RTL: the document mirrors, and the undo toast produced by
// a guardian unlink renders fully inside the viewport (not clipped off the
// mirrored edge, the same class of regression caught for the archive dialog
// in students-crud.spec.ts).
// ---------------------------------------------------------------------------
test('Scenario 5 — RTL: document direction mirrors and the undo toast stays on-screen', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const dir = await win.evaluate(() => document.documentElement.dir);
  expect(dir).toBe(locale() === 'ar' ? 'rtl' : 'ltr');

  await gotoParents(win, L);
  await createParent(win, L, { name: 'Ahmed Alaoui', phone: '0612345678', relation: 'pere' });
  await gotoStudents(win, L);
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await openStudentGuardiansTab(win, 'Yassine Alaoui', L);
  await linkViaAutocomplete(win, L.guardians.add, L.guardians.searchPlaceholder, 'Ahmed', 'Ahmed Alaoui');
  await win.getByRole('button', { name: L.guardians.unlink('Ahmed Alaoui') }).click();

  const undo = win.locator('[data-sonner-toaster]').getByRole('button', { name: L.undo, exact: true }).last();
  await expect(undo).toBeVisible();
  const box = (await undo.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x, 'undo toast button is within the viewport (not off-screen)').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
});

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
  type Launched,
  type Locale,
} from './student-parent-linking.fixtures';

/**
 * SOU-42 — Student ↔ Parent linking UI (bidirectional). Black-box, driven only
 * through the running packaged app. Runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are the student-side link happy
 * path (the canonical top-level "link a student to a parent" flow) and the
 * same-name-students-under-different-parents case — this is the explicit
 * CLAUDE.md dedup rule (student naturalKey = normalized name + parentId), a
 * hard data-integrity invariant. Create-new-inline, unlink/undo (both
 * sides), bidirectional-reflection, and RTL are lower blast-radius —
 * unit/component test the linking use case and autocomplete instead.
 *
 * Locked UX decision asserted here: linking is an INLINE panel on the detail
 * screens (student detail → "Responsables" tab; parent detail sheet →
 * children list), never the full edit form.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
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

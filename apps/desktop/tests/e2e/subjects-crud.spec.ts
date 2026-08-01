import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  gotoSubjects,
  rowMenuLabel,
  pageCrashed,
  subjectName,
  type Launched,
  type Locale,
  type CreatedSubject,
} from './subjects.fixtures';

/**
 * SOU-47 — Subjects (Matières) CRUD UI. Black-box, driven only through the
 * running packaged app. Every spec runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects.
 *
 * Acceptance criteria under test:
 *   1. List/read: table with code, bilingual name, active state, in-use count +
 *      Actif/Inactif tabs.
 *   2. Create: code auto-uppercased & unique, FR+AR name required, inline errors.
 *   3. Rename: name.fr/name.ar editable, code NOT editable.
 *   4. Deactivate / reactivate (reversible, moves between tabs).
 *   5. Delete guard: soft-delete when unused; blocked modal naming the
 *      referencing group (by level) when in use.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: CreatedSubject[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' };
const PHYS = { nameFr: 'Physique', nameAr: 'الفيزياء' }; // no code

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Subjects page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

function shot(name: string): string {
  // Per-test output dir so screenshots land with the run's artifacts on CI and
  // any machine — never a hardcoded absolute path.
  return test.info().outputPath(`sou47-${name}-${test.info().project.name}.png`);
}

test('AC1 list/read — table columns, bilingual name, state, in-use count, tabs', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH, PHYS] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  // Column headers.
  await expect(live.win.getByRole('columnheader', { name: L.table.code })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.name })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.state })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.inUse })).toBeVisible();

  // Actif / Inactif tabs.
  await expect(live.win.getByRole('tab', { name: L.tabs.active, exact: true })).toBeVisible();
  await expect(live.win.getByRole('tab', { name: L.tabs.inactive, exact: true })).toBeVisible();

  // Bilingual name shows the active-locale variant.
  const mathName = subjectName(loc, MATH);
  const physName = subjectName(loc, PHYS);
  const mathRow = live.win.getByRole('row', { name: new RegExp(mathName) });
  await expect(mathRow).toBeVisible();
  await expect(mathRow).toContainText(L.state.active);
  await expect(mathRow).toContainText(MATH.code); // code present
  // Physique has no code → the placeholder dash.
  const physRow = live.win.getByRole('row', { name: new RegExp(physName) });
  await expect(physRow).toBeVisible();
  await expect(physRow).toContainText(L.table.noCode);

  await live.win.screenshot({ path: shot('list') });
});

test('AC1 empty states — no subjects, and empty inactive tab', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  await expect(live.win.getByText(L.empty.title)).toBeVisible();
  await live.win.getByRole('tab', { name: L.tabs.inactive, exact: true }).click();
  await expect(live.win.getByText(L.inactiveEmpty.title)).toBeVisible();
});

test('AC2 create — code auto-uppercased, row appears, success toast', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  await live.win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Chimie');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('الكيمياء');
  await dialog.getByLabel(L.form.code, { exact: false }).fill('chim'); // lowercase
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(live.win.getByText(L.form.createSuccess)).toBeVisible();
  const row = live.win.getByRole('row', { name: /Chimie/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('CHIM'); // auto-uppercased
});

test('AC2 create validation — required names + invalid code, inline & localized', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  // Empty submit → two inline "required" messages.
  await live.win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByText(L.errors.required)).toHaveCount(2);

  // Invalid code (contains a space) → inline invalid-code message.
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Anglais');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('الإنجليزية');
  await dialog.getByLabel(L.form.code, { exact: false }).fill('EN GL');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByText(L.errors.invalidCode)).toBeVisible();
});

test('AC2 create — duplicate code is rejected with a localized message', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH] }); // MATH code already exists
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  await live.win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = live.win.getByRole('dialog');
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Mécanique');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('الميكانيك');
  await dialog.getByLabel(L.form.code, { exact: false }).fill('math'); // collides with MATH
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(live.win.getByText(L.errors.duplicateCode)).toBeVisible();
});

test('AC3 rename — name editable, code NOT editable', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.edit }).click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.editTitle })).toBeVisible();

  // Code field must NOT be present in the edit dialog.
  await expect(dialog.getByLabel(L.form.code, { exact: false })).toHaveCount(0);

  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Maths renforcées');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(live.win.getByText(L.form.editSuccess)).toBeVisible();
  if (loc === 'fr') {
    await expect(live.win.getByRole('row', { name: /Maths renforcées/ })).toBeVisible();
  } else {
    // FR name changed; AR name unchanged, row still present under its AR name.
    await expect(live.win.getByRole('row', { name: new RegExp(MATH.nameAr) })).toBeVisible();
  }
});

test('AC4 deactivate then reactivate — reversible, moves between tabs', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  // Deactivate from the active tab's row menu.
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.deactivate }).click();
  await expect(live.win.getByText(L.deactivate.success)).toBeVisible();
  // Gone from Actives.
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);

  // Present in Inactives; reactivate.
  await live.win.getByRole('tab', { name: L.tabs.inactive, exact: true }).click();
  const inactiveRow = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(inactiveRow).toBeVisible();
  await inactiveRow.getByRole('button', { name: L.row.activate }).click();
  await expect(live.win.getByText(L.activate.success)).toBeVisible();
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);

  // Back in Actives.
  await live.win.getByRole('tab', { name: L.tabs.active, exact: true }).click();
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toBeVisible();
});

test('AC5 delete when NOT in use — soft-delete removes it from all tabs', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH] }); // no group → inUseCount 0
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.delete }).click();

  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.delete.title })).toBeVisible();
  await dialog.getByRole('button', { name: L.delete.confirm, exact: true }).click();
  await expect(live.win.getByText(L.delete.success)).toBeVisible();

  // Gone from Actives and Inactives.
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  await live.win.getByRole('tab', { name: L.tabs.inactive, exact: true }).click();
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
});

test('AC5 delete when IN USE — blocked modal names the referencing group', async () => {
  const loc = locale();
  const L = STR[loc];
  const GROUP_LEVEL = '3ème A Bac';
  live = await boot(loc, { subjects: [MATH], groups: [{ subjectIdx: 0, level: GROUP_LEVEL }] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  const row = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  // In-use count reflects the one live group (locale-formatted "1").
  const oneFormatted = new Intl.NumberFormat(loc).format(1);
  await expect(row).toContainText(oneFormatted);

  // Open the menu and click Delete → blocked modal.
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  const deleteItem = live.win.getByRole('menuitem', { name: L.row.delete });
  await expect(deleteItem).toBeVisible();
  // NOTE: the item is intentionally NOT natively-disabled (design: keep the
  // tooltip + informative modal reachable). Record its disabled state.
  const nativelyDisabled = await deleteItem.isDisabled();
  test.info().annotations.push({ type: 'delete-item-nativelyDisabled', description: String(nativelyDisabled) });

  await deleteItem.click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.delete.blockedTitle })).toBeVisible();
  // The named reference: kind label + the group's level (NOT just a count).
  await expect(dialog.getByText(L.referenceKind.group, { exact: false })).toBeVisible();
  await expect(dialog.getByText(GROUP_LEVEL, { exact: false })).toBeVisible();
  // Deactivate offered as the alternative.
  await expect(dialog.getByRole('button', { name: L.delete.deactivateInstead })).toBeVisible();

  await live.win.screenshot({ path: shot('delete-blocked') });
});

test('AC5 delete-blocked — disabled hint tooltip on the delete action', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH], groups: [{ subjectIdx: 0, level: '2 Bac SM' }] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  const deleteItem = live.win.getByRole('menuitem', { name: L.row.delete });
  await deleteItem.hover();
  // The hint text ends with "à la place" (fr) / "بدلاً من ذلك" (ar).
  const hintFragment = loc === 'fr' ? 'à la place' : 'بدلاً من ذلك';
  await expect(live.win.getByText(new RegExp(hintFragment)).first()).toBeVisible({ timeout: 5000 });
});

test('nav + RTL — Matières link precedes Groupes; html dir matches locale', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH] });

  await expect(live.win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);

  const subjectsLink = live.win.getByRole('link', { name: L.navSubjects, exact: true });
  const groupsLink = live.win.getByRole('link', { name: L.navGroups, exact: true });
  await expect(subjectsLink).toBeVisible();
  await expect(groupsLink).toBeVisible();

  // Matières appears before Groupes in the sidebar DOM order.
  const order = await live.win.evaluate(
    ({ subjects, groups }) => {
      const all = Array.from(document.querySelectorAll('a'));
      const s = all.findIndex((a) => a.textContent?.trim() === subjects);
      const g = all.findIndex((a) => a.textContent?.trim() === groups);
      return { s, g };
    },
    { subjects: L.navSubjects, groups: L.navGroups },
  );
  expect(order.s).toBeGreaterThanOrEqual(0);
  expect(order.g).toBeGreaterThan(order.s);

  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);
  await live.win.screenshot({ path: shot('nav-rtl') });
});

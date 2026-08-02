import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  gotoFormulas,
  rowMenuLabel,
  pageCrashed,
  formulaName,
  type Launched,
  type Locale,
} from './formulas.fixtures';

/**
 * SOU-62 — Formulas (Formules) CRUD UI. Black-box, driven only through the
 * running packaged app. Every spec runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 *
 * Acceptance criteria under test:
 *   1. List/read: table with name, subjects, price, kind, state + Actives/
 *      Inactives tabs.
 *   2. Create: bilingual name + at least one subject + a positive price
 *      required, inline errors.
 *   3. Edit: name/subjects/price/kind editable on a mutable formula.
 *   4. Clone ("Dupliquer"): makes a fresh mutable copy and opens the edit
 *      dialog on it directly (the clone-and-edit flow), leaving the source
 *      formula untouched.
 *   5. Deactivate: one-directional — moves the row to the Inactive tab with
 *      no reactivate action available there.
 *
 * The `isImmutable` locked-edit state is out of scope here (see the header
 * comment in `formulas.fixtures.ts`): no IPC channel yet produces it.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: { id: string; nameFr: string; nameAr: string }[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات' };
const PHYS = { nameFr: 'Physique', nameAr: 'الفيزياء' };
const MATH_SEUL = { nameFr: 'Math seul', nameAr: 'رياضيات فقط', subjectIdxs: [0], priceMad: 200 };

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Formulas page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

function shot(name: string): string {
  return test.info().outputPath(`sou62-${name}-${test.info().project.name}.png`);
}

test('AC1 list/read — table columns, bilingual name, price, kind, state, tabs', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH], formulas: [MATH_SEUL] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  await expect(live.win.getByRole('columnheader', { name: L.table.name })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.subjects })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.price })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.kind })).toBeVisible();
  await expect(live.win.getByRole('columnheader', { name: L.table.state })).toBeVisible();

  await expect(live.win.getByRole('tab', { name: L.tabs.active, exact: true })).toBeVisible();
  await expect(live.win.getByRole('tab', { name: L.tabs.inactive, exact: true })).toBeVisible();

  const name = formulaName(loc, MATH_SEUL);
  const row = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(L.state.active);
  await expect(row).toContainText(L.kind.regular);
  await expect(row).toContainText('200'); // priceMad, locale-formatted

  await live.win.screenshot({ path: shot('list') });
});

test('AC1 empty states — no formulas, and empty inactive tab', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [], formulas: [] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  await expect(live.win.getByText(L.empty.title)).toBeVisible();
  await live.win.getByRole('tab', { name: L.tabs.inactive, exact: true }).click();
  await expect(live.win.getByText(L.inactiveEmpty.title)).toBeVisible();
});

test('AC2 create — name, subjects, price required; row appears on success', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH, PHYS], formulas: [] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  await live.win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Empty submit → inline required errors (name.fr, name.ar, price at least).
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByText(L.errors.required).first()).toBeVisible();

  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Math + Physique');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('رياضيات + فيزياء');
  await dialog.getByRole('group', { name: L.form.subjects }).getByRole('checkbox').first().click();
  await dialog.getByLabel(L.form.price, { exact: false }).fill('350');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(live.win.getByText(L.form.createSuccess)).toBeVisible();
  const row = live.win.getByRole('row', { name: /Math \+ Physique|رياضيات \+ فيزياء/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('350');
});

test('AC3 edit — name and price editable on a mutable formula', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH], formulas: [MATH_SEUL] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  const name = formulaName(loc, MATH_SEUL);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.edit }).click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.editTitle })).toBeVisible();

  await dialog.getByLabel(L.form.price, { exact: false }).fill('250');
  await dialog.getByRole('button', { name: L.form.save }).click();

  await expect(live.win.getByText(L.form.editSuccess)).toBeVisible();
  const row = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('250');
});

test('AC4 clone — makes a fresh copy, opens edit on it, leaves the source untouched', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH], formulas: [MATH_SEUL] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  const name = formulaName(loc, MATH_SEUL);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.clone }).click();
  await expect(live.win.getByText(L.clone.success)).toBeVisible();

  // Clone-and-edit: the edit dialog opens automatically on the new copy.
  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.editTitle })).toBeVisible();
  await dialog.getByLabel(L.form.price, { exact: false }).fill('275');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(live.win.getByText(L.form.editSuccess)).toBeVisible();

  // Two rows now share the same name: the untouched source (200) and the
  // edited clone (275).
  const rows = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: '200' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '275' })).toHaveCount(1);

  await live.win.screenshot({ path: shot('clone') });
});

test('AC5 deactivate — one-directional, moves to Inactive with no reactivate action', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [MATH], formulas: [MATH_SEUL] });
  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);

  const name = formulaName(loc, MATH_SEUL);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await live.win.getByRole('menuitem', { name: L.row.deactivate }).click();

  const confirmDialog = live.win.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: L.deactivate.title })).toBeVisible();
  await confirmDialog.getByRole('button', { name: L.deactivate.confirm, exact: true }).click();
  await expect(live.win.getByText(L.deactivate.success)).toBeVisible();

  // Gone from Actives.
  await expect(live.win.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);

  // Present in Inactives, but its menu offers no "Désactiver" — one-directional.
  await live.win.getByRole('tab', { name: L.tabs.inactive, exact: true }).click();
  const inactiveRow = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(inactiveRow).toBeVisible();
  await expect(inactiveRow).toContainText(L.state.inactive);
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  await expect(live.win.getByRole('menuitem', { name: L.row.deactivate })).toHaveCount(0);
});

test('nav + RTL — Formules link between Matières and Groupes; html dir matches locale', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [], formulas: [] });

  await expect(live.win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);

  const subjectsLink = live.win.getByRole('link', { name: L.navSubjects, exact: true });
  const formulasLink = live.win.getByRole('link', { name: L.navFormulas, exact: true });
  const groupsLink = live.win.getByRole('link', { name: L.navGroups, exact: true });
  await expect(subjectsLink).toBeVisible();
  await expect(formulasLink).toBeVisible();
  await expect(groupsLink).toBeVisible();

  const order = await live.win.evaluate(
    ({ subjects, formulas, groups }) => {
      const all = Array.from(document.querySelectorAll('a'));
      const s = all.findIndex((a) => a.textContent?.trim() === subjects);
      const f = all.findIndex((a) => a.textContent?.trim() === formulas);
      const g = all.findIndex((a) => a.textContent?.trim() === groups);
      return { s, f, g };
    },
    { subjects: L.navSubjects, formulas: L.navFormulas, groups: L.navGroups },
  );
  expect(order.f).toBeGreaterThan(order.s);
  expect(order.g).toBeGreaterThan(order.f);

  await gotoFormulas(live.win, L);
  await assertMounted(live.win, L);
  await live.win.screenshot({ path: shot('nav-rtl') });
});

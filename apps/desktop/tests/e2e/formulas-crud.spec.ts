import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoFormulas, pageCrashed, type Launched, type Locale } from './formulas.fixtures';

/**
 * SOU-62 — Formulas (Formules) CRUD UI. Black-box, driven only through the
 * running packaged app. Runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects.
 *
 * Critical-only per SOU-142: kept scenario is create (the canonical
 * top-level "create a formula" flow). List/read rendering, empty states,
 * edit, clone, deactivate, and nav/RTL are lower blast-radius UI behavior —
 * unit/component test the form and table instead. The one hard invariant on
 * this entity (price/subjects immutable after invoice) is covered in
 * `formulas-lock-and-price.spec.ts`.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: { id: string; nameFr: string; nameAr: string }[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات' };
const PHYS = { nameFr: 'Physique', nameAr: 'الفيزياء' };

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Formulas page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

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

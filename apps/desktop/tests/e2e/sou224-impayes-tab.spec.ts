import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  gotoArrears,
  seedOverdueInvoice,
  seedParent,
  monthsAgo,
  escapeRegExp,
  type Launched,
  type Locale,
} from './arrears.fixtures';
import { CASH } from './payments-cash-desk.fixtures';

/**
 * SOU-224 — Impayés (arrears) is folded into the Paiements page as its THIRD
 * tab; the standalone /arrears route and its nav item are gone. Black-box,
 * through the running packaged app only. Both `fr` (LTR) and `ar` (RTL).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function gotoPaymentsPage(win: Launched['win'], nav: string): Promise<void> {
  await win.getByRole('link', { name: nav, exact: true }).click();
  await win.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// AC1 — The Paiements page shows exactly THREE tabs: record, recent feed,
// Impayés (arrears).
// ---------------------------------------------------------------------------
test('AC1 — Paiements page shows three tabs incl. Impayés', async () => {
  const L = STR[locale()];
  const C = CASH[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoPaymentsPage(win, L.navPayments);
  expect(await pageCrashed(win)).toBe(false);

  await expect(win.getByRole('tab', { name: C.record.title })).toBeVisible();
  await expect(win.getByRole('tab', { name: C.feed.title })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.navArrears, exact: true })).toBeVisible();
  await expect(win.getByRole('tab'), 'exactly three tabs, no more, no less').toHaveCount(3);

  await win.screenshot({ path: `test-results/sou224-three-tabs-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — The standalone /arrears route is GONE: a direct hash to it does not
// render the old page — it redirects to the default route (dashboard). And no
// "Impayés" nav LINK exists in the sidebar (it is a tab now, not a route).
// ---------------------------------------------------------------------------
test('AC2 — /arrears route and its nav link are gone (no dead link)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // No sidebar nav link named "Impayés" anymore.
  await expect(win.getByRole('link', { name: L.navArrears, exact: true }), 'no standalone Impayés nav link').toHaveCount(0);

  // Direct hash to the retired route redirects to the default route, not a blank/crash.
  await win.evaluate(() => {
    window.location.hash = '#/arrears';
  });
  await win.waitForTimeout(500);
  expect(await pageCrashed(win), 'no crash on retired route').toBe(false);
  const hash = await win.evaluate(() => location.hash);
  expect(hash, 'retired /arrears redirects to the default route').toBe('#/dashboard');
  const bodyText = await win.evaluate(() => document.body.innerText.trim());
  expect(bodyText.length, 'must not render a blank page').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// AC3 — The Impayés TAB carries the full arrears experience: aging-by-parent
// list, filters, PDF export, per-row quick actions. Seeds one parent with two
// overdue children. Also covers FR/AR RTL (dir + MAD/د.م. formatting).
// ---------------------------------------------------------------------------
test('AC3 — Impayés tab shows the full arrears experience (aging, filters, export, per-row actions)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const month = monthsAgo(new Date(), 2);

  const parentName = 'Fatima Bennani';
  const parent = await seedParent(win, { name: parentName, phone: '0612345678' });
  await seedOverdueInvoice(win, { parent, studentNameFr: 'Amine Bennani', studentNameAr: 'أمين بناني', month, priceMad: 150 });
  await seedOverdueInvoice(win, { parent, studentNameFr: 'Sara Bennani', studentNameAr: 'سارة بناني', month, priceMad: 250 });

  await gotoArrears(win, L); // opens Paiements → selects the Impayés tab (SOU-224)
  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('heading', { name: L.title })).toBeVisible();

  // RTL + locale MAD formatting.
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  const bodyText = await win.evaluate(() => document.body.innerText);
  if (locale() === 'ar') expect(bodyText).toContain('د.م.');
  else expect(bodyText).toContain('MAD');

  // Aging summary region + a visible bucket label present.
  await expect(win.getByRole('group', { name: L.aging.groupLabel })).toBeVisible();
  await expect(win.getByText(L.aging.bucket['60'], { exact: true }).first()).toBeVisible();

  // Filters present (month input is an aria-labelled control).
  await expect(win.getByLabel(L.filters.monthLabel, { exact: true })).toBeVisible();
  await expect(win.getByRole('combobox', { name: L.filters.groupLabel })).toBeVisible();
  await expect(win.getByRole('combobox', { name: L.filters.statusLabel })).toBeVisible();

  // PDF export affordance present and enabled (data is seeded); its printed
  // sheet carries the "Liste des impayés — relances téléphoniques" heading.
  await expect(win.getByRole('button', { name: L.actions.exportList, exact: true })).toBeEnabled();
  // The call-sheet heading lives in a print-only (display:none) block, so it is
  // matched by text (getByRole filters hidden nodes out).
  await expect(win.getByText(L.print.title, { exact: true }), 'call-sheet PDF title present in the DOM').toHaveCount(1);

  // Aging-by-parent card: total outstanding = 150 + 250 = 400.
  const card = win.getByRole('button', { name: escapeRegExp(parentName), exact: false });
  await expect(card).toBeVisible();
  await expect(card).toContainText('400');

  // Expand → both children listed + per-row quick actions (record payment / open invoice).
  await card.click();
  const amine = locale() === 'ar' ? 'أمين بناني' : 'Amine Bennani';
  await expect(win.getByText(escapeRegExp(amine)).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.actions.recordPayment, exact: true }).first()).toBeVisible();
  // "Ouvrir la facture" is a real internal link to the invoice detail (not a dead href).
  const openInvoice = win.getByRole('link', { name: L.actions.openInvoice, exact: true }).first();
  await expect(openInvoice).toBeVisible();
  await expect(openInvoice).toHaveAttribute('href', /#\/invoicing\//);

  await win.screenshot({ path: `test-results/sou224-impayes-tab-${locale()}.png`, fullPage: true });
});

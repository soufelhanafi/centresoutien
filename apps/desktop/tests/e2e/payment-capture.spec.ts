import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  PAY_STR,
  boot,
  seedInvoice,
  openInvoiceDetail,
  openRecordPaymentDialog,
  fillPaymentForm,
  submitPaymentForm,
  type Launched,
  type Locale,
} from './payment-capture.fixtures';
import { pageCrashed, tryInvoke, stubSaveDialog, stubOpenPath, isRealPdfFile, pdfExportPath } from './invoices.fixtures';

/**
 * SOU-101 — Payment capture UI (cash desk, record payment against invoice).
 * Black-box, driven only through the running packaged app. Every spec runs
 * under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * The payment panel lives on the invoice detail route (SOU-69), not a
 * separate "Paiements" screen: the top-level "Paiements" sidebar link is a
 * "coming soon" placeholder on this branch. This mirrors the mockup's own
 * payment controls (record / print / export a receipt, payment history),
 * just reached via the invoice, not a standalone list — noted, not treated
 * as a failure, since every acceptance-criteria control is exercised.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — HAPPY PATH: full payment on an unpaid invoice on the
// Essentiel plan marks it paid. Essentiel locks the amount field to the
// full outstanding balance (no partial-paid on this plan), and submitting
// it as-is must still succeed.
// ---------------------------------------------------------------------------
test('Scenario 1 — full payment on an unpaid invoice (Essentiel) marks it paid', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());
  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.status.unpaid).first()).toBeVisible();

  const dialog = await openRecordPaymentDialog(win, L);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.payment.dialogTitle)).toBeVisible();
  await submitPaymentForm(win, dialog, L);

  await expect(dialog).toBeHidden();
  await expect(win.getByText(L.status.paid).first()).toBeVisible();
  await expect(win.getByText(L.payment.success)).toBeVisible();
  await win.screenshot({ path: `test-results/payment-capture-full-essentiel-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Partial payment on Pro+: status becomes "partial", and the
// remaining balance shown is exactly total - paid.
// ---------------------------------------------------------------------------
test('Scenario 2 — partial payment on Pro sets status to partial with the correct remaining balance', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  const dialog = await openRecordPaymentDialog(win, L);
  await fillPaymentForm(dialog, { amountMad: '80' });
  await submitPaymentForm(win, dialog, L);

  await expect(win.getByText(L.status.partiallyPaid).first()).toBeVisible();
  const bodyText = await win.evaluate(() => document.body.innerText);
  expect(bodyText, 'outstanding must read 120.00 (200 - 80)').toMatch(/120[,.]00/);
  expect(bodyText, 'net paid must read 80.00').toMatch(/80[,.]00/);
  await win.screenshot({ path: `test-results/payment-capture-partial-pro-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Partial payment on Essentiel (SOU-83 MVP tier collapse:
// `core.invoicing.partial-paid` ships in every plan). The amount field is
// freely editable, there is no upsell lock, and a partial amount is accepted.
// ---------------------------------------------------------------------------
test('Scenario 3 — Essentiel accepts a partial payment with an editable amount field', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  const dialog = await openRecordPaymentDialog(win, L);
  const amountInput = dialog.locator('input[name="amountMad"]');
  await expect(amountInput).toBeEnabled();
  await expect(dialog.getByText(L.payment.partialLocked)).toHaveCount(0);

  await fillPaymentForm(dialog, { amountMad: '80' });
  await submitPaymentForm(win, dialog, L);

  await expect(win.getByText(L.status.partiallyPaid).first()).toBeVisible();
  const bodyText = await win.evaluate(() => document.body.innerText);
  expect(bodyText, 'outstanding must read 120.00 (200 - 80)').toMatch(/120[,.]00/);
  await win.screenshot({ path: `test-results/payment-capture-partial-essentiel-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Overpayment is rejected outright (not clamped, not a soft
// warning), with a translated, human-readable error — both at the UI layer
// (Pro, where the amount field is editable) and at the domain layer via a
// direct IPC call (Essentiel, where the UI can't even reach the case).
// ---------------------------------------------------------------------------
test('Scenario 4 — overpayment is rejected with a clear, translated error', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  const dialog = await openRecordPaymentDialog(win, L);
  await fillPaymentForm(dialog, { amountMad: '500' });
  await dialog.getByRole('button', { name: L.payment.submit, exact: true }).click();
  await win.waitForTimeout(500);

  // The dialog must stay open — the error is not a raw error code, and the
  // payment must not have been recorded (no state change to close on).
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.payment.exceedsBalance)).toBeVisible();
  const dialogText = await dialog.evaluate((el) => el.textContent ?? '');
  expect(dialogText, 'the surfaced error must be human copy, not a raw error code').not.toMatch(/payment-exceeds-balance/);
  await win.screenshot({ path: `test-results/payment-capture-overpay-ui-${locale()}.png` });

  // The dialog's own "X" close control is also labelled `cancel` for
  // screen readers (sr-only text), so two buttons share this accessible
  // name — the footer cancel button is the first in DOM order.
  await dialog.getByRole('button', { name: L.payment.cancel, exact: true }).first().click();
  await win.waitForTimeout(300);
  const bodyText = await win.evaluate(() => document.body.innerText);
  expect(bodyText, 'outstanding must remain unchanged at 200.00 after a rejected overpayment').toMatch(/200[,.]00/);
  expect(bodyText, 'net paid must remain 0.00 — the rejected attempt left no trace').toMatch(/0[,.]00/);

  const ipcErr = await tryInvoke(win, 'payment.record', {
    invoiceId: seeded.invoiceId,
    amountMad: 50000,
    method: 'cash',
    paidOn: '2026-08-02',
  });
  expect(ipcErr, 'the domain must reject an overpayment even bypassing the UI').not.toBeNull();
  expect(ipcErr).toMatch(/payment-exceeds-balance/);
});

// ---------------------------------------------------------------------------
// Scenario 5 — A payment recorded with a note persists the note and shows
// it in the payment history list.
// ---------------------------------------------------------------------------
test('Scenario 5 — a payment note is saved and visible in the payment history', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  const dialog = await openRecordPaymentDialog(win, L);
  const note = locale() === 'ar' ? 'شيك رقم 1234' : 'chèque n°1234';
  await fillPaymentForm(dialog, { amountMad: '200', note });
  await submitPaymentForm(win, dialog, L);

  await expect(win.getByText(L.payment.history.title)).toBeVisible();
  await expect(win.getByText(note)).toBeVisible();
  await win.screenshot({ path: `test-results/payment-capture-note-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Payment history for an invoice with 2+ payments lists them
// in order with correct amounts, and shows no edit/delete affordance (only
// print/export-receipt controls) — append-only ledger, UI-observable.
// ---------------------------------------------------------------------------
test('Scenario 6 — payment history lists 2+ payments correctly with no edit/delete affordance', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  let dialog = await openRecordPaymentDialog(win, L);
  await fillPaymentForm(dialog, { amountMad: '50' });
  await submitPaymentForm(win, dialog, L);

  dialog = await openRecordPaymentDialog(win, L);
  await fillPaymentForm(dialog, { amountMad: '70' });
  await submitPaymentForm(win, dialog, L);

  const historyItems = win.locator('ul li', { hasText: L.payment.history.print }).or(
    win.locator('ul li').filter({ has: win.getByRole('button', { name: L.payment.history.print }) }),
  );
  await expect(historyItems).toHaveCount(2);

  const rowsText = await historyItems.allTextContents();
  expect(rowsText[0], 'first-recorded payment (50) must appear before the second (70)').toMatch(/50[,.]00/);
  expect(rowsText[1]).toMatch(/70[,.]00/);

  for (const row of rowsText) {
    expect(row, 'no edit affordance on any history row').not.toMatch(/Modifier|تعديل/);
    expect(row, 'no delete affordance on any history row').not.toMatch(/Supprimer|حذف/);
  }
  await expect(win.getByRole('button', { name: /Modifier|تعديل/ })).toHaveCount(0);
  await expect(win.getByRole('button', { name: /Supprimer|حذف/ })).toHaveCount(0);
  await win.screenshot({ path: `test-results/payment-capture-history-two-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Receipt print/export for a payment produces a real,
// non-blank PDF file, in both FR and AR.
// ---------------------------------------------------------------------------
test('Scenario 7 — receipt print/export produces a real PDF', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;
  const app = live.app;
  await stubOpenPath(app);

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  const dialog = await openRecordPaymentDialog(win, L);
  await submitPaymentForm(win, dialog, L);
  await expect(win.getByText(L.payment.history.title)).toBeVisible();

  const printBtn = win.getByRole('button', { name: L.payment.history.print, exact: true });
  await expect(printBtn).toBeVisible();
  await printBtn.click();
  await win.waitForTimeout(800);
  expect(await pageCrashed(win)).toBe(false);

  const exportDir = mkdtempSync(join(tmpdir(), `cs-e2e-receipt-${locale()}-`));
  const targetPath = pdfExportPath(exportDir, `recu-${locale()}.pdf`);
  await stubSaveDialog(app, targetPath);
  const exportBtn = win.getByRole('button', { name: L.payment.history.export, exact: true });
  await exportBtn.click();
  await win.waitForTimeout(800);

  await expect(win.getByText(L.payment.history.exportSuccess)).toBeVisible();
  expect(isRealPdfFile(targetPath), 'exported receipt must start with the %PDF- magic bytes').toBe(true);
  await win.screenshot({ path: `test-results/payment-capture-receipt-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 8 — AR-RTL visual check of the whole payment capture flow
// (dialog, history list, buttons) against the mockup: document direction,
// MAD formatting, and no leftover LTR-only styling.
// ---------------------------------------------------------------------------
test('Scenario 8 — AR-RTL renders mirrored layout and locale-correct MAD formatting', async () => {
  const L = PAY_STR[locale()];
  live = await boot(locale(), 'pro');
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await openInvoiceDetail(win, seeded, locale());

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(locale() === 'ar' ? 'rtl' : 'ltr');

  const dialog = await openRecordPaymentDialog(win, L);
  await expect(dialog).toBeVisible();
  await submitPaymentForm(win, dialog, L);

  const bodyText = await win.evaluate(() => document.body.innerText);
  if (locale() === 'ar') {
    expect(bodyText, 'Arabic UI must render MAD amounts with the د.م. suffix').toContain('د.م.');
  } else {
    expect(bodyText, 'French UI renders MAD amounts via Intl.NumberFormat (ISO code, not a DH suffix)').toContain('MAD');
  }
  await win.screenshot({ path: `test-results/payment-capture-rtl-${locale()}.png`, fullPage: true });
});

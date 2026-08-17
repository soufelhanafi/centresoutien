import { test, expect } from '@playwright/test';
import { boot as bootInvoices, seedInvoice } from './invoices.fixtures';
import {
  PAY_STR,
  openInvoiceDetail,
  openRecordPaymentDialog,
  fillPaymentForm,
  submitPaymentForm,
} from './payment-capture.fixtures';
import { STR as STUD, gotoStudents } from './students.fixtures';
import { locale, createLiveAppHarness } from './sou265.fixtures';

/**
 * SOU-265 — general write smoke (attribution blast-radius regression). Every
 * write now attributes to the real logged-in user; smoke two ordinary director
 * writes end-to-end — create a student and record a payment — and confirm they
 * still succeed and appear. Proves the `updatedBy`-everywhere change did not
 * break normal create/update flows; who is stored is not inspected.
 */

const app = createLiveAppHarness();

test('S3 — ordinary director writes still succeed (create student + record payment)', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  const L = STUD[loc];
  app.set(await bootInvoices(loc));
  const win = app.get()!.win;

  // Write #1 — create a student through the UI dialog; the row appears.
  await gotoStudents(win, L);
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Salma Bennani');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('سلمى بناني');
  await dialog.getByLabel(L.form.birthDate, { exact: false }).fill('2011-03-09');
  await dialog.getByLabel(L.form.level, { exact: false }).fill('2AC');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(win.getByRole('row', { name: /Salma Bennani/ })).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s3-student-${loc}.png` });

  // Write #2 — record a full payment through the invoice-detail UI dialog.
  const P = PAY_STR[loc];
  const seeded = await seedInvoice(win, {
    nameFr: 'Payeur Test',
    nameAr: 'دافع اختبار',
    month: '2026-08',
    priceMad: 200,
    issue: true,
  });
  await openInvoiceDetail(win, seeded, loc);
  const payDialog = await openRecordPaymentDialog(win, P);
  await fillPaymentForm(payDialog, { amountMad: '200' });
  await submitPaymentForm(win, payDialog, P);
  await expect(win.getByText(P.payment.success)).toBeVisible();
  await win.screenshot({ path: `test-results/sou265-s3-payment-${loc}.png` });
});

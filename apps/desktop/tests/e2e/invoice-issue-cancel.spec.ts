import { test, expect } from '@playwright/test';
import {
  DIRECTION,
  STR,
  boot,
  gotoInvoices,
  pageCrashed,
  recordFullPayment,
  seedInvoice,
  tryInvoke,
  escapeRegExp,
  type Launched,
  type Locale,
} from './invoices.fixtures';
import { ISSUE_CANCEL_STR, openInvoiceDetail, seedIssuedInvoice } from './invoice-issue-cancel.fixtures';

/**
 * SOU-143 — Wire invoice.issue / invoice.cancel IPC channels + the invoice
 * detail page's issue/cancel actions (draft invoices were previously stuck
 * forever, per `invoices-list-detail-print-export.spec.ts`'s former Scenario
 * 8 coverage-gap note). Black-box, driven only through the running packaged
 * app. Every spec runs under both the `fr` (LTR) and `ar` (RTL) Playwright
 * projects.
 *
 * Locked scope decisions verified here (from the SOU-143 kickoff comment):
 *   1. Cancelling requires a confirmation dialog (terminal, no-undo).
 *   2. The confirm dialog warns when the invoice already has recorded
 *      payments (payments are append-only/orthogonal to invoice status —
 *      cancelling does NOT touch them; the UI is the only place this is
 *      surfaced).
 *   3. Issuing a draft invoice requires NO confirmation — a single click.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — HAPPY PATH: issuing a draft invoice is a single click (no
// confirmation dialog), flips status draft -> issued, and the change is
// reflected live in the detail header and after navigating back to the list.
// ---------------------------------------------------------------------------
test('Scenario 1 — issuing a draft invoice is a single click and status flips live', async () => {
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openInvoiceDetail(win, studentName, seeded.studentNameFr);

  const issueBtn = win.getByRole('button', { name: C.issue.action, exact: true });
  await expect(issueBtn).toBeVisible();
  await expect(win.getByRole('dialog')).toHaveCount(0);

  await issueBtn.click();
  // No confirmation dialog must ever appear for issuing.
  await win.waitForTimeout(200);
  await expect(win.getByRole('dialog')).toHaveCount(0);

  await expect(win.getByText(C.issue.success)).toBeVisible();
  await win.waitForTimeout(400);
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/issue-cancel-issued-${locale()}.png` });

  // The "Émettre"/"إصدار" action is a draft-only transition — issuing again
  // must no longer be offered once the invoice is issued.
  await expect(win.getByRole('button', { name: C.issue.action, exact: true })).toHaveCount(0);
  // Cancel remains available (issued -> cancelled is still a valid transition).
  await expect(win.getByRole('button', { name: C.cancel.action, exact: true })).toBeVisible();

  await win.getByRole('link', { name: L.detail.back }).click();
  await win.waitForTimeout(400);
  await expect(win.getByRole('row', { name: escapeRegExp(studentName) })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — Cancelling a DRAFT invoice (no payments): confirmation dialog
// shows, with the generic (no-payment) body, and confirming moves it to
// `cancelled`, a terminal state with neither action still offered.
// ---------------------------------------------------------------------------
test('Scenario 2 — cancelling a draft invoice with no payments requires confirmation, then succeeds', async () => {
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openInvoiceDetail(win, studentName, seeded.studentNameFr);

  await win.getByRole('button', { name: C.cancel.action, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(C.cancel.title)).toBeVisible();
  const dialogText = (await dialog.textContent()) ?? '';
  expect(dialogText, 'no-payment cancel dialog must show the plain terminal-action warning').toContain(C.cancel.bodyNoPayments);
  expect(dialogText, 'a draft invoice with zero payments must NOT show the payment-amount warning').not.toContain(C.cancel.bodyPaymentsLeadIn);
  await win.screenshot({ path: `test-results/issue-cancel-dialog-draft-nopayment-${locale()}.png` });

  await dialog.getByRole('button', { name: C.cancel.confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
  await win.waitForTimeout(400);

  await expect(win.getByText(C.cancel.success)).toBeVisible();
  await expect(win.getByText(L.status.cancelled).first()).toBeVisible();
  await expect(win.getByRole('button', { name: C.issue.action, exact: true })).toHaveCount(0);
  await expect(win.getByRole('button', { name: C.cancel.action, exact: true })).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 3 — Cancelling an ISSUED invoice with NO payments: same
// confirmation contract as a draft invoice (issued -> cancelled is symmetric
// with draft -> cancelled), no payment warning.
// ---------------------------------------------------------------------------
test('Scenario 3 — cancelling an issued invoice with no payments shows no payment warning', async () => {
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedIssuedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openInvoiceDetail(win, studentName, seeded.studentNameFr);

  // Sanity: this invoice really is issued (no "issue" action offered).
  await expect(win.getByRole('button', { name: C.issue.action, exact: true })).toHaveCount(0);

  await win.getByRole('button', { name: C.cancel.action, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const dialogText = (await dialog.textContent()) ?? '';
  expect(dialogText).toContain(C.cancel.bodyNoPayments);
  expect(dialogText).not.toContain(C.cancel.bodyPaymentsLeadIn);

  await dialog.getByRole('button', { name: C.cancel.confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
  await win.waitForTimeout(400);
  await expect(win.getByText(L.status.cancelled).first()).toBeVisible();
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/issue-cancel-issued-then-cancelled-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Cancelling an ISSUED invoice that HAS a recorded payment: the
// confirm dialog must warn with the paid amount (payments are append-only and
// orthogonal to invoice status — the domain does not block this transition;
// the UI is the only place this warning can be surfaced). Confirming still
// cancels and the payment history is preserved untouched.
// ---------------------------------------------------------------------------
test('Scenario 4 — cancelling an issued invoice with a recorded payment warns with the paid amount', async () => {
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedIssuedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await recordFullPayment(win, seeded.invoiceId, 100);
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openInvoiceDetail(win, studentName, seeded.studentNameFr);

  await expect(win.getByText(L.status['partially-paid']).first()).toBeVisible();

  await win.getByRole('button', { name: C.cancel.action, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const dialogText = (await dialog.textContent()) ?? '';
  expect(dialogText, 'a cancel of an invoice with a recorded payment must include the payment-warning lead-in').toContain(
    C.cancel.bodyPaymentsLeadIn,
  );
  expect(dialogText, 'the warning must quote the recorded amount (100.00)').toContain('100');
  await win.screenshot({ path: `test-results/issue-cancel-dialog-with-payment-warning-${locale()}.png` });

  await dialog.getByRole('button', { name: C.cancel.confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
  await win.waitForTimeout(400);

  await expect(win.getByText(L.status.cancelled).first()).toBeVisible();
  // The payment record itself must survive the cancellation untouched
  // (append-only, orthogonal to invoice status).
  await expect(win.getByText(L.detail.payment.netPaid, { exact: true })).toBeVisible();
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/issue-cancel-cancelled-with-payment-preserved-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Dismissing the cancel confirmation must NOT cancel the
// invoice: closing the dialog (dismiss button) leaves the invoice in its
// prior state, and both actions remain available afterward.
// ---------------------------------------------------------------------------
test('Scenario 5 — dismissing the cancel confirmation leaves the invoice untouched', async () => {
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedIssuedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openInvoiceDetail(win, studentName, seeded.studentNameFr);

  await win.getByRole('button', { name: C.cancel.action, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The dialog's icon-only close ("X") button happens to share the same
  // accessible name as the labeled dismiss button in this shadcn Dialog, so
  // scope to the first (labeled) match — the same disambiguation the other
  // suites use for this component.
  await dialog.getByRole('button', { name: C.cancel.dismiss, exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await win.waitForTimeout(300);

  // Still issued, not cancelled: the cancel action is still offered, and no
  // "cancelled" badge/tone appeared.
  await expect(win.getByRole('button', { name: C.cancel.action, exact: true })).toBeVisible();
  await expect(win.getByText(L.status.cancelled)).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 6 — domain-side guard: once an invoice is terminal (cancelled),
// the plain IPC channels themselves reject a further issue/cancel attempt —
// proof the guard is enforced at the domain boundary, not merely by hiding
// the button (UI hiding is cosmetic per this app's plan/domain-gating rule).
// ---------------------------------------------------------------------------
test('Scenario 6 — invoice.issue / invoice.cancel reject an invalid transition off a cancelled invoice', async () => {
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedIssuedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  const cancelOk = await tryInvoke(win, 'invoice.cancel', { invoiceId: seeded.invoiceId });
  expect(cancelOk, 'first cancel on a freshly-issued invoice must succeed').toBeNull();

  const secondCancel = await tryInvoke(win, 'invoice.cancel', { invoiceId: seeded.invoiceId });
  expect(secondCancel, 'cancelling an already-cancelled invoice must be rejected (terminal state)').not.toBeNull();

  const issueAfterCancel = await tryInvoke(win, 'invoice.issue', { invoiceId: seeded.invoiceId });
  expect(issueAfterCancel, 'issuing a cancelled invoice must be rejected (terminal state)').not.toBeNull();
});

// ---------------------------------------------------------------------------
// Scenario 7 — AR/RTL: the confirmation dialog renders mirrored and the
// interpolated MAD amount in the payment warning uses the AR locale's
// currency formatting, matching the app-wide `Intl.NumberFormat` convention.
// ---------------------------------------------------------------------------
test('Scenario 7 — AR locale renders the cancel dialog RTL with correctly formatted MAD in the warning', async () => {
  test.skip(locale() !== 'ar', 'AR-specific formatting assertion; the fr project already covers the LTR path above');
  const L = STR[locale()];
  const C = ISSUE_CANCEL_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedIssuedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await recordFullPayment(win, seeded.invoiceId, 100);
  await gotoInvoices(win, L);
  await openInvoiceDetail(win, seeded.studentNameAr, seeded.studentNameFr);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION.ar);

  await win.getByRole('button', { name: C.cancel.action, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const dialogText = (await dialog.textContent()) ?? '';
  expect(dialogText, 'the AR warning must use the Arabic MAD symbol, not the FR "MAD" ISO code').toContain('د.م.');
  expect(dialogText).toContain('100');
  await win.screenshot({ path: `test-results/issue-cancel-dialog-ar-rtl.png` });
});

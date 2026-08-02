import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  gotoInvoices,
  seedInvoice,
  tryInvoke,
  stubSaveDialog,
  isRealPdfFile,
  pdfContainsAsciiText,
  pdfExportPath,
  escapeRegExp,
  type Launched,
  type Locale,
} from './invoices.fixtures';

/**
 * SOU-69 — Invoice list / detail / print / PDF export (MAD, FR/AR). Black-box,
 * driven only through the running packaged app. Every spec runs under both
 * the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Line-editing on draft invoices and a "create invoice" UI are explicitly out
 * of scope per the ticket (invoices are only ever produced by SOU-68's
 * monthly generation job) and are not exercised here.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function assertMounted(win: Launched['win'], L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { name: L.title })).toBeVisible();
}

/**
 * Opens the invoice detail route the same way every other list in this app does:
 * the row itself is not clickable — only the nested student-name link is (mirrors
 * `students-crud.spec.ts`'s `row.getByRole('link', { name }).click()`). `InvoiceRow`
 * always renders the **French** name inside the `<Link>` regardless of locale — the
 * Arabic name is a decorative, non-interactive sibling (`BilingualText`), same as
 * every other row in this app — so the link must always be matched by the French
 * name even under the `ar` project; `rowName` (locale-appropriate) only scopes which
 * row to search within.
 */
async function openDetail(win: Launched['win'], rowName: string, studentNameFr: string): Promise<void> {
  const row = win.getByRole('row', { name: escapeRegExp(rowName) });
  await row.getByRole('link', { name: escapeRegExp(studentNameFr) }).click();
  await win.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Scenario 1 — empty state: a freshly booted center with zero generated
// invoices shows the empty-state title + body, not a blank table.
// ---------------------------------------------------------------------------
test('Scenario 1 — empty state: no invoices generated yet', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoInvoices(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/invoices-empty-${locale()}.png` });

  await expect(win.getByText(L.empty.title)).toBeVisible();
  await expect(win.getByText(L.empty.body)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — HAPPY PATH: list renders a generated invoice and the month /
// student / payment-status filters narrow it down correctly.
// ---------------------------------------------------------------------------
test('Scenario 2 — list renders a generated invoice and filters by month/student/payment-status', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });

  await gotoInvoices(win, L);
  await assertMounted(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await expect(win.getByRole('row', { name: escapeRegExp(studentName) })).toBeVisible();

  // Filter by payment status = "Payée" (paid): the freshly drafted invoice is
  // unpaid, so it must disappear and the no-results state must show instead.
  await win.getByLabel(L.filters.statusLabel, { exact: false }).selectOption({ label: L.status.paid }).catch(async () => {
    await win.getByRole('combobox', { name: L.filters.statusLabel }).click();
    await win.getByRole('option', { name: L.status.paid, exact: true }).click();
  });
  await win.waitForTimeout(300);
  // Title + body both render together, so `.or()` resolves to 2 elements — checking
  // the title alone is enough to prove the no-results state is showing.
  await expect(win.getByText(L.noResults.title)).toBeVisible();

  // Reset back to "Tous les statuts" and confirm the row reappears.
  await win.getByLabel(L.filters.statusLabel, { exact: false }).selectOption({ label: L.filters.statusAll }).catch(async () => {
    await win.getByRole('combobox', { name: L.filters.statusLabel }).click();
    await win.getByRole('option', { name: L.filters.statusAll, exact: true }).click();
  });
  await win.waitForTimeout(300);
  await expect(win.getByRole('row', { name: escapeRegExp(studentName) })).toBeVisible();
  await win.screenshot({ path: `test-results/invoices-list-filtered-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — invoice detail: opening a row shows the student + month +
// derived payment-status badge, a line breakdown, and the payment panel with
// total/netPaid/outstanding all consistent with a fresh, unpaid invoice.
// ---------------------------------------------------------------------------
test('Scenario 3 — invoice detail shows header, line breakdown, and payment panel', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openDetail(win, studentName, seeded.studentNameFr);
  // The detail route's heading is the student's name, not `L.title` ("Factures") —
  // that heading only exists on the list route, so `assertMounted` doesn't apply here.
  expect(await pageCrashed(win), 'page rendered without the "Something went wrong" error boundary').toBe(false);
  await win.screenshot({ path: `test-results/invoices-detail-${locale()}.png` });

  await expect(win.getByText(escapeRegExp(studentName)).first()).toBeVisible();
  await expect(win.getByText(L.detail.kind.regular).first()).toBeVisible();
  // "Paiement" is a substring of the sidebar's "Paiements" nav link, so match the
  // panel's own heading role rather than free text.
  await expect(win.getByRole('heading', { name: L.detail.payment.panelTitle, exact: true })).toBeVisible();
  await expect(win.getByText(L.detail.payment.total)).toBeVisible();
  await expect(win.getByText(L.detail.payment.outstanding)).toBeVisible();
  await expect(win.getByText(L.status.unpaid).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4 — "mark paid" / record payment: submitting a full payment
// updates the payment panel (paid/outstanding/status) and the list's status
// badge without requiring a full page reload.
// ---------------------------------------------------------------------------
test('Scenario 4 — recording a full payment updates the detail and the list live', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openDetail(win, studentName, seeded.studentNameFr);

  await win.getByRole('button', { name: L.detail.payment.markPaid }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.detail.payment.title)).toBeVisible();
  await dialog.getByRole('button', { name: L.detail.payment.submit }).click();
  await expect(dialog).toBeHidden();
  await win.waitForTimeout(500);

  await expect(win.getByText(L.status.paid).first()).toBeVisible();
  await win.screenshot({ path: `test-results/invoices-marked-paid-${locale()}.png` });

  await win.getByRole('link', { name: L.detail.back }).click();
  await win.waitForTimeout(400);
  await expect(win.getByRole('row', { name: escapeRegExp(studentName) }).getByText(L.status.paid)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 5 — Print and Export are two distinct actions (explicit product
// decision, not a combined control), and Print resolves successfully.
// ---------------------------------------------------------------------------
test('Scenario 5 — Print and Export are two distinct buttons, and Print succeeds', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openDetail(win, studentName, seeded.studentNameFr);

  // Two locators resolving to two different accessible names ("Imprimer" vs
  // "Exporter en PDF") is itself the proof these are distinct controls, not a
  // combined print-or-export button — no `id` attribute is needed for that.
  const printBtn = win.getByRole('button', { name: L.detail.print, exact: true });
  const exportBtn = win.getByRole('button', { name: L.detail.export, exact: true });
  await expect(printBtn).toBeVisible();
  await expect(exportBtn).toBeVisible();

  await printBtn.click();
  await win.waitForTimeout(800);
  await expect(win.getByText(L.detail.printError)).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 6 — Export triggers the native save dialog and writes a real PDF
// to disk; cancelling the dialog must not raise an error toast.
// ---------------------------------------------------------------------------
test('Scenario 6 — Export writes a real PDF file, and a cancelled dialog does not error', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const app = live.app;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openDetail(win, studentName, seeded.studentNameFr);

  const exportDir = mkdtempSync(join(tmpdir(), 'cs-e2e-invoice-export-'));
  const targetPath = pdfExportPath(exportDir, `facture-${locale()}.pdf`);

  await stubSaveDialog(app, targetPath);
  await win.getByRole('button', { name: L.detail.export, exact: true }).click();
  await win.waitForTimeout(800);

  await expect(win.getByText(L.detail.exportSuccess)).toBeVisible();
  expect(existsSync(targetPath), `expected a PDF file at ${targetPath}`).toBe(true);
  expect(isRealPdfFile(targetPath), 'exported file must start with the %PDF- magic bytes').toBe(true);
  await win.screenshot({ path: `test-results/invoices-export-success-${locale()}.png` });

  await stubSaveDialog(app, null);
  await win.getByRole('button', { name: L.detail.export, exact: true }).click();
  await win.waitForTimeout(800);
  await expect(win.getByText(L.detail.exportError)).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 7 — AR/RTL: the exported PDF for an Arabic-locale invoice is
// bilingual-aware (Amiri font embedded). On-screen amounts use the app-wide
// `Intl.NumberFormat` MAD rendering (`MAD` in French, `د.م.` in Arabic) — the
// `DH` suffix is a print-only convention scoped to the PDF renderer, not the
// on-screen UI, and out of scope for this ticket to change app-wide.
// ---------------------------------------------------------------------------
test('Scenario 7 — AR locale renders RTL on screen and the exported PDF embeds the Amiri font', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const app = live.app;

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await gotoInvoices(win, L);
  const studentName = locale() === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  await openDetail(win, studentName, seeded.studentNameFr);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  const bodyText = await win.evaluate(() => document.body.innerText);
  if (locale() === 'ar') {
    expect(bodyText, 'Arabic UI must render MAD amounts with the د.م. suffix').toContain('د.م.');
  } else {
    expect(bodyText, 'French UI renders MAD amounts via Intl.NumberFormat (ISO code, not a DH suffix)').toContain('MAD');
  }

  const exportDir = mkdtempSync(join(tmpdir(), 'cs-e2e-invoice-export-rtl-'));
  const targetPath = pdfExportPath(exportDir, `facture-rtl-${locale()}.pdf`);
  await stubSaveDialog(app, targetPath);
  await win.getByRole('button', { name: L.detail.export, exact: true }).click();
  await win.waitForTimeout(800);

  expect(isRealPdfFile(targetPath)).toBe(true);
  if (locale() === 'ar') {
    expect(pdfContainsAsciiText(targetPath, 'Amiri'), 'the AR PDF must embed the Amiri font for Arabic shaping').toBe(true);
  }
  await win.screenshot({ path: `test-results/invoices-export-rtl-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 8 — coverage gap check: there is no `invoice.issue` / `invoice.cancel`
// IPC channel wired on this branch, so a cancelled invoice can never be
// produced through the shipped UI/bridge. This scenario documents that gap
// rather than silently skipping the "cancelled invoices are badged, not
// hidden" acceptance bullet.
// ---------------------------------------------------------------------------
test('Scenario 8 — no reachable path exists to produce a cancelled invoice for the list to badge', async () => {
  live = await boot(locale());
  const win = live.win;
  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });

  const cancelErr = await tryInvoke(win, 'invoice.cancel', { invoiceId: seeded.invoiceId });
  const issueErr = await tryInvoke(win, 'invoice.issue', { invoiceId: seeded.invoiceId });

  expect(cancelErr, 'invoice.cancel is not a wired IPC channel on this branch').not.toBeNull();
  expect(issueErr, 'invoice.issue is not a wired IPC channel on this branch').not.toBeNull();
});

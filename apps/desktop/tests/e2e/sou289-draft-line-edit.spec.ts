import { test, expect } from '@playwright/test';
import {
  STR as SUB_STR,
  boot,
  pageCrashed,
  createStudentAndOpenDetail,
  gotoSubscriptionTab,
  seedFormula,
  formulaName,
  type Launched,
  type Locale,
} from './student-subscription.fixtures';
import { STR as INV_STR, gotoInvoices, tryInvoke, escapeRegExp } from './invoices.fixtures';
import {
  SOU289_STR,
  YASSINE,
  REGULAR_FORMULA,
  subscribeViaWizard,
  currentMonth,
  listStudentInvoices,
  createSubscriptionViaBridge,
  seedStudentViaBridge,
  issueInvoiceViaBridge,
} from './sou289-enrollment-invoice.fixtures';

/**
 * SOU-289 — Draft invoice line amount editing (AC7). Black-box, driven only
 * through the running packaged app (UI + the public preload bridge). Runs
 * under both the `fr` (LTR) and `ar` (RTL) projects; locale-independent
 * scenarios run once, on `fr`. The enrollment-generates-the-invoice half of
 * SOU-289 lives in `sou289-enrollment-invoice.spec.ts`, which also owns the
 * shared fixtures file.
 *
 * Given / When / Then map (acceptance criterion SOU-289 AC7):
 *
 *  S7  (AC7)  Given a DRAFT invoice detail, When the director edits a line
 *             amount, Then any positive MAD amount is accepted and the total
 *             updates; 0 / negative are rejected with a readable message.
 *  S7b (AC7)  Given an ISSUED (and then CANCELLED) invoice, Then no line-edit
 *             affordance exists.
 *  S7c (AC7)  Domain-side guard: `invoice.updateLineAmount` itself rejects a
 *             non-draft invoice and non-positive amounts.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.beforeEach(async () => {
  // S7 chains boot + UI student creation + the wizard + the edit dialog; the
  // suite-wide 30s budget is not enough.
  test.setTimeout(90_000);
});
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// S7 (AC7) — draft-line amount editing: an arbitrary positive MAD amount is
// accepted and the total updates; 0 and negative are rejected readably.
// ---------------------------------------------------------------------------
test('S7 — a draft line amount can be edited to any positive MAD amount; 0/negative are rejected', async () => {
  const L = SUB_STR[locale()];
  const I = INV_STR[locale()];
  const T = SOU289_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedFormula(win, REGULAR_FORMULA);
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), REGULAR_FORMULA), card: 'regular' });
  const viewAction = win.getByRole('button', { name: T.toast.view }).or(win.getByRole('link', { name: T.toast.view }));
  await expect(viewAction.first()).toBeVisible();
  // Sonner toasts animate in from off-viewport; dispatch the click directly.
  await viewAction.first().dispatchEvent('click');
  await expect(win.getByRole('link', { name: I.detail.back })).toBeVisible();

  const editAction = win.getByRole('button', { name: T.lineEdit.actionFor(formulaName(locale(), REGULAR_FORMULA)) });
  await expect(editAction, 'a DRAFT invoice line must offer an edit affordance').toBeVisible();
  await editAction.click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(T.lineEdit.title)).toBeVisible();

  const amountInput = dialog.getByLabel(T.lineEdit.amount, { exact: false });
  const submit = dialog.getByRole('button', { name: T.lineEdit.submit, exact: true });

  // Invalid: zero. The rejection may be a pre-submit disabled state or a
  // post-submit message — either way the dialog must stay open and a readable
  // message must be visible.
  await amountInput.fill('0');
  if (await submit.isEnabled()) {
    await submit.click();
  }
  await expect(dialog, 'a 0 MAD amount must not be accepted').toBeVisible();
  await expect(
    win.getByText(T.lineEdit.invalidAmount).first(),
    'rejecting 0 must show a readable message',
  ).toBeVisible();
  await win.screenshot({ path: `test-results/sou289-s7-zero-rejected-${locale()}.png` });

  // Invalid: negative.
  await amountInput.fill('-50');
  if (await submit.isEnabled()) {
    await submit.click();
  }
  await expect(dialog, 'a negative MAD amount must not be accepted').toBeVisible();
  await expect(
    win.getByText(T.lineEdit.invalidAmount).first(),
    'rejecting a negative amount must show a readable message',
  ).toBeVisible();

  // Valid: arbitrary positive amount.
  await amountInput.fill('250');
  await expect(submit, 'a positive amount must be submittable').toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(win.getByText(T.lineEdit.success)).toBeVisible();
  await expect(
    win.getByText(/250[.,]00/).first(),
    'the edited line amount (and refreshed total) must render on the detail',
  ).toBeVisible();
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou289-s7-edited-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S7b (AC7) — ISSUED and CANCELLED invoices offer no edit affordance.
// ---------------------------------------------------------------------------
test('S7b — no line-edit affordance on an issued or cancelled invoice', async () => {
  test.skip(locale() !== 'fr', 'affordance-absence is locale-independent — verified once on fr');
  const I = INV_STR[locale()];
  const T = SOU289_STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const month = currentMonth();

  const regular = await seedFormula(win, REGULAR_FORMULA);
  const { studentId } = await seedStudentViaBridge(win, YASSINE);
  const created = await createSubscriptionViaBridge(win, {
    studentId,
    formulaId: regular.formulaId,
    kind: 'regular',
    subjectIds: [regular.subjectId],
    startMonth: month,
  });
  await issueInvoiceViaBridge(win, created.invoiceId!);

  await gotoInvoices(win, I);
  await win.getByRole('row', { name: escapeRegExp(YASSINE.nameFr) }).getByRole('link', { name: escapeRegExp(YASSINE.nameFr) }).click();
  await expect(win.getByRole('link', { name: I.detail.back })).toBeVisible();
  const editAction = win.getByRole('button', { name: T.lineEdit.actionFor(formulaName(locale(), REGULAR_FORMULA)) });
  await expect(editAction, 'an ISSUED invoice must not offer a line-edit affordance').toHaveCount(0);

  // Cancel it through the bridge; the detail after reload must still offer nothing.
  await tryInvoke(win, 'invoice.cancel', { invoiceId: created.invoiceId! });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await gotoInvoices(win, I);
  await win.getByRole('row', { name: escapeRegExp(YASSINE.nameFr) }).getByRole('link', { name: escapeRegExp(YASSINE.nameFr) }).click();
  await expect(win.getByRole('link', { name: I.detail.back })).toBeVisible();
  await expect(win.getByText(I.status.cancelled).first()).toBeVisible();
  await expect(editAction, 'a CANCELLED invoice must not offer a line-edit affordance').toHaveCount(0);
});

// ---------------------------------------------------------------------------
// S7c (AC7) — the domain guard itself: `invoice.updateLineAmount` rejects a
// non-draft invoice and non-positive amounts at the bridge, independent of
// any UI hiding (UI hiding is cosmetic per this app's gating rule).
// ---------------------------------------------------------------------------
test('S7c — invoice.updateLineAmount rejects non-draft invoices and non-positive amounts', async () => {
  test.skip(locale() !== 'fr', 'bridge-level, locale-independent — verified once on fr');
  live = await boot(locale());
  const win = live.win;
  const month = currentMonth();

  const regular = await seedFormula(win, REGULAR_FORMULA);
  const { studentId } = await seedStudentViaBridge(win, YASSINE);
  const created = await createSubscriptionViaBridge(win, {
    studentId,
    formulaId: regular.formulaId,
    kind: 'regular',
    subjectIds: [regular.subjectId],
    startMonth: month,
  });
  const [invoice] = await listStudentInvoices(win, studentId);
  const lineId = invoice!.lines[0]!.id;

  const zero = await tryInvoke(win, 'invoice.updateLineAmount', { invoiceId: invoice!.id, lineId, amountMad: 0 });
  expect(zero, 'amount 0 must be rejected').not.toBeNull();
  const negative = await tryInvoke(win, 'invoice.updateLineAmount', { invoiceId: invoice!.id, lineId, amountMad: -5000 });
  expect(negative, 'a negative amount must be rejected').not.toBeNull();

  const positive = await tryInvoke(win, 'invoice.updateLineAmount', { invoiceId: invoice!.id, lineId, amountMad: 25000 });
  expect(positive, 'a positive amount on a draft must succeed').toBeNull();

  await issueInvoiceViaBridge(win, created.invoiceId!);
  const onIssued = await tryInvoke(win, 'invoice.updateLineAmount', { invoiceId: invoice!.id, lineId, amountMad: 30000 });
  expect(onIssued, 'editing a line on an ISSUED invoice must be rejected').not.toBeNull();
  expect(onIssued).toContain('invoice-not-draft');

  const after = await listStudentInvoices(win, studentId);
  expect(after[0]!.totalMad, 'the issued invoice keeps the last draft-time amount').toBe(25000);
});

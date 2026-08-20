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
import { STR as INV_STR, gotoInvoices, escapeRegExp } from './invoices.fixtures';
import { ISSUE_CANCEL_STR } from './invoice-issue-cancel.fixtures';
import {
  SOU289_STR,
  YASSINE,
  REGULAR_FORMULA,
  EXAM_FORMULA,
  subscribeViaWizard,
  currentMonth,
  shiftMonth,
  listStudentInvoices,
  createSubscriptionViaBridge,
  seedStudentViaBridge,
  issueInvoiceViaBridge,
  generateMonthlyViaBridge,
} from './sou289-enrollment-invoice.fixtures';

/**
 * SOU-289 — Generate the student's first invoice immediately on enrollment.
 * Black-box, driven only through the running packaged app (UI + the public
 * preload bridge). Runs under both the `fr` (LTR) and `ar` (RTL) projects;
 * locale-independent bridge-level guards run once, on `fr`. The draft-line
 * amount-editing half of SOU-289 lives in `sou289-draft-line-edit.spec.ts`.
 *
 * Given / When / Then map (acceptance criteria SOU-289, AC1–AC6):
 *
 *  S1  (AC1)  Given a formula and a student, When the director subscribes the
 *             student for the current month via the wizard, Then a success
 *             toast offers "Voir la facture", the invoice is a DRAFT for the
 *             month with the full formula price in MAD, and it appears in the
 *             invoice list — with no monthly batch run.
 *  S1b (AC1)  ...and Then the invoice is also visible on the student detail
 *             ("Factures" tab).
 *  S2  (AC2)  Given an enrollment already drafted the month's invoice, When
 *             the monthly batch runs for that month, Then the student still
 *             has exactly one invoice for the month (zero duplicates).
 *  S3  (AC3)  Given the monthly batch already generated the month's invoice,
 *             When the already-billed student enrolls again (second kind),
 *             Then no second invoice is created for that student/month.
 *  S4  (AC4)  Given an active regular subscription billed this month, When
 *             the student also subscribes to an exam-prep formula, Then the
 *             existing month invoice gains a SECOND LINE (full prices, MAD)
 *             — never a second invoice.
 *  S5  (AC5)  Given a future startMonth, When the director subscribes, Then
 *             no invoice is generated now and the UI communicates the wait
 *             calmly.
 *  S6  (AC6)  Given the month's invoice was ISSUED before a second
 *             enrollment, When the exam-prep subscription is created, Then it
 *             IS created, the issued invoice is untouched, and the UI warns
 *             the formula is not on the issued invoice.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.beforeEach(async () => {
  // These flows chain boot + UI student creation + one or two wizard rounds +
  // toast auto-dismissal; the suite-wide 30s budget is not enough.
  test.setTimeout(90_000);
});
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// S1 (AC1) — happy path: enrolling for the current month immediately drafts
// the month's invoice; the success toast offers "Voir la facture" which opens
// the DRAFT invoice showing the formula at its full MAD price; the invoice is
// also in the invoice list. No monthly batch was ever run.
// ---------------------------------------------------------------------------
test('S1 — enrolling for the current month immediately drafts the invoice, toast opens it', async () => {
  const L = SUB_STR[locale()];
  const I = INV_STR[locale()];
  const T = SOU289_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedFormula(win, REGULAR_FORMULA);
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);

  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), REGULAR_FORMULA), card: 'regular' });

  // Success feedback names the drafted invoice and offers to open it.
  await expect(win.getByText(T.toast.ready)).toBeVisible();
  const viewAction = win.getByRole('button', { name: T.toast.view }).or(win.getByRole('link', { name: T.toast.view }));
  await expect(viewAction.first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou289-s1-toast-${locale()}.png` });
  // Sonner toasts animate in from off-viewport; dispatch the click directly.
  await viewAction.first().dispatchEvent('click');

  // The opened invoice detail: the back link proves the navigation landed;
  // DRAFT status is proven by the draft-only "Émettre la facture" action (the
  // detail header badges the payment status, not the lifecycle status).
  await expect(win.getByRole('link', { name: I.detail.back })).toBeVisible();
  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('button', { name: ISSUE_CANCEL_STR[locale()].issue.action, exact: true })).toBeVisible();
  await expect(win.getByText(escapeRegExp(formulaName(locale(), REGULAR_FORMULA))).first()).toBeVisible();
  const pageText = (await win.textContent('body')) ?? '';
  expect(pageText, 'full formula price must appear on the invoice detail').toMatch(/200/);
  if (locale() === 'ar') {
    expect(await win.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(pageText, 'AR locale must format MAD with the Arabic symbol').toContain('د.م.');
  } else {
    expect(pageText, 'FR locale must format amounts as MAD').toContain('MAD');
  }
  await win.screenshot({ path: `test-results/sou289-s1-invoice-detail-${locale()}.png` });

  // The invoice list also shows it — one row for the student. NOTE: the list's
  // "Statut" column badges the PAYMENT status ("Non payée"), not the draft
  // lifecycle status — so draft-ness is asserted through the public bridge.
  await gotoInvoices(win, I);
  const rowName = locale() === 'ar' ? YASSINE.nameAr : YASSINE.nameFr;
  await expect(win.getByRole('row', { name: escapeRegExp(rowName) })).toHaveCount(1);
  const invoices = await win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    return (await api.invoke('invoice.list', {})) as { invoices: { status: string; month: string }[] };
  });
  expect(invoices.invoices).toHaveLength(1);
  expect(invoices.invoices[0]!.status, 'the enrollment-generated invoice must be a DRAFT').toBe('draft');
});

// ---------------------------------------------------------------------------
// S1b (AC1) — the invoice is visible on the student detail as well.
// ---------------------------------------------------------------------------
test('S1b — the freshly drafted invoice is visible on the student detail (Factures tab)', async () => {
  const L = SUB_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedFormula(win, REGULAR_FORMULA);
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), REGULAR_FORMULA), card: 'regular' });
  await expect(win.getByText(SOU289_STR[locale()].toast.ready)).toBeVisible();

  // Let the toast dismiss so its text can't satisfy (or occlude) the tab assertions.
  await expect(win.getByText(SOU289_STR[locale()].toast.ready)).toBeHidden({ timeout: 15000 });

  await win.getByRole('tab', { name: L.detailTabs.invoices }).click();
  // The tab reuses the invoice list content: the month invoice's full 200 MAD
  // total is the row's identifying, user-visible datum — waiting on it also
  // proves the tab finished loading before the negative assertions below.
  await expect(
    win.getByText(/200[.,]00/).first(),
    "the drafted invoice must be visible on the student detail's Factures tab",
  ).toBeVisible();
  await win.screenshot({ path: `test-results/sou289-s1b-student-invoices-tab-${locale()}.png` });
  const tabText = (await win.textContent('body')) ?? '';
  const placeholder = locale() === 'ar' ? 'الفواتير قريبًا' : 'Factures bientôt disponibles';
  expect(tabText, 'the coming-soon placeholder must be gone').not.toContain(placeholder);
  expect(
    tabText,
    'with a freshly drafted invoice the tab must not show its empty state',
  ).not.toContain(SOU289_STR[locale()].studentInvoicesEmptyTitle);
});

// ---------------------------------------------------------------------------
// S2 (AC2) — running the monthly batch after an enrollment-drafted invoice
// creates ZERO duplicates for that student/month.
// ---------------------------------------------------------------------------
test('S2 — the monthly batch after enrollment creates zero duplicate invoices', async () => {
  test.skip(locale() !== 'fr', 'bridge-level, locale-independent — verified once on fr');
  live = await boot(locale());
  const win = live.win;
  const month = currentMonth();

  const { subjectId, formulaId } = await seedFormula(win, REGULAR_FORMULA);
  const { studentId } = await seedStudentViaBridge(win, YASSINE);
  const created = await createSubscriptionViaBridge(win, {
    studentId,
    formulaId,
    kind: 'regular',
    subjectIds: [subjectId],
    startMonth: month,
  });
  expect(created.invoiceOutcome, 'enrollment for the current month must immediately create the invoice').toBe('created');
  expect(created.invoiceId).not.toBeNull();

  await generateMonthlyViaBridge(win, month);
  await generateMonthlyViaBridge(win, month); // twice — belt and braces on idempotence

  const invoices = await listStudentInvoices(win, studentId);
  expect(invoices.filter((i) => i.month === month)).toHaveLength(1);
  expect(invoices[0]!.id).toBe(created.invoiceId);
  expect(invoices[0]!.status).toBe('draft');
  expect(invoices[0]!.totalMad).toBe(200 * 100);
});

// ---------------------------------------------------------------------------
// S3 (AC3) — reverse order: the batch generated the month first; enrolling an
// already-billed student afterwards must NOT create a second invoice.
// ---------------------------------------------------------------------------
test('S3 — enrolling after the batch already generated the month adds no second invoice', async () => {
  test.skip(locale() !== 'fr', 'bridge-level, locale-independent — verified once on fr');
  live = await boot(locale());
  const win = live.win;
  const month = currentMonth();

  const regular = await seedFormula(win, REGULAR_FORMULA);
  const exam = await seedFormula(win, EXAM_FORMULA);
  const { studentId } = await seedStudentViaBridge(win, YASSINE);

  // The regular subscription starts LAST month, so the current month's invoice
  // is created by the BATCH, not by the enrollment hook.
  await createSubscriptionViaBridge(win, {
    studentId,
    formulaId: regular.formulaId,
    kind: 'regular',
    subjectIds: [regular.subjectId],
    startMonth: shiftMonth(month, -1),
  });
  await generateMonthlyViaBridge(win, month);
  const afterBatch = (await listStudentInvoices(win, studentId)).filter((i) => i.month === month);
  expect(afterBatch, 'precondition: the batch drafted the current month').toHaveLength(1);

  // The already-billed student now enrolls again (exam-prep, same month).
  const second = await createSubscriptionViaBridge(win, {
    studentId,
    formulaId: exam.formulaId,
    kind: 'exam-prep',
    subjectIds: [exam.subjectId],
    startMonth: month,
  });
  expect(second.invoiceOutcome).toBe('line-appended');

  const afterEnroll = (await listStudentInvoices(win, studentId)).filter((i) => i.month === month);
  expect(afterEnroll, 'still exactly ONE invoice for the student/month').toHaveLength(1);
  expect(afterEnroll[0]!.id).toBe(afterBatch[0]!.id);
});

// ---------------------------------------------------------------------------
// S4 (AC4) — a second same-month subscription (regular + exam-prep) lands as
// a SECOND LINE on the existing month invoice, full formula prices in MAD.
// Driven entirely through the UI wizard.
// ---------------------------------------------------------------------------
test('S4 — a second same-month subscription becomes a second line, never a second invoice', async () => {
  const L = SUB_STR[locale()];
  const I = INV_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedFormula(win, REGULAR_FORMULA);
  await seedFormula(win, EXAM_FORMULA);
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);

  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), REGULAR_FORMULA), card: 'regular' });
  await expect(win.getByText(SOU289_STR[locale()].toast.ready)).toBeVisible();
  // Let the toast auto-dismiss before the next wizard — while alive it overlays
  // and intercepts clicks on the dialog's confirm button.
  await expect(win.getByText(SOU289_STR[locale()].toast.ready)).toBeHidden({ timeout: 15000 });
  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), EXAM_FORMULA), card: 'exam-prep' });
  // The exam-prep card showing its formula proves the second write landed
  // before we navigate away.
  await expect(win.getByText(escapeRegExp(formulaName(locale(), EXAM_FORMULA))).first()).toBeVisible();

  // One invoice only, carrying both lines at full price: 200 + 800 = 1000 MAD.
  await gotoInvoices(win, I);
  const rowName = locale() === 'ar' ? YASSINE.nameAr : YASSINE.nameFr;
  const row = win.getByRole('row', { name: escapeRegExp(rowName) });
  await expect(row, 'exactly one invoice row for the student').toHaveCount(1);
  await row.getByRole('link', { name: escapeRegExp(YASSINE.nameFr) }).click();
  await expect(win.getByRole('link', { name: I.detail.back })).toBeVisible();

  await expect(win.getByText(escapeRegExp(formulaName(locale(), REGULAR_FORMULA))).first()).toBeVisible();
  await expect(win.getByText(escapeRegExp(formulaName(locale(), EXAM_FORMULA))).first()).toBeVisible();
  const pageText = (await win.textContent('body')) ?? '';
  expect(pageText).toMatch(/200/);
  expect(pageText).toMatch(/800/);
  expect(pageText, 'the invoice total must be the sum of both full formula prices (1 000 MAD)').toMatch(/1[\s\u00a0\u202f.,]?000/);
  await win.screenshot({ path: `test-results/sou289-s4-two-lines-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// S5 (AC5) — future startMonth: no invoice now; the UI communicates the wait
// calmly; the invoice list stays empty.
// ---------------------------------------------------------------------------
test('S5 — a future startMonth defers invoicing to that month\'s batch, calmly', async () => {
  const L = SUB_STR[locale()];
  const I = INV_STR[locale()];
  const T = SOU289_STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await seedFormula(win, REGULAR_FORMULA);
  await createStudentAndOpenDetail(win, L, YASSINE);
  await gotoSubscriptionTab(win, L);
  await subscribeViaWizard(win, L, {
    formulaLabel: formulaName(locale(), REGULAR_FORMULA),
    card: 'regular',
    startMonth: shiftMonth(currentMonth(), 1),
  });

  await expect(win.getByText(T.toast.deferred)).toBeVisible();
  await expect(win.getByRole('button', { name: T.toast.view })).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou289-s5-deferred-toast-${locale()}.png` });

  await gotoInvoices(win, I);
  await expect(win.getByText(I.empty.title)).toBeVisible();
});

// ---------------------------------------------------------------------------
// S6 (AC6) — the month's invoice was ISSUED before the second enrollment: the
// subscription is still created, the issued invoice is untouched, and the UI
// warns that the formula is not on the issued invoice.
// ---------------------------------------------------------------------------
test('S6 — enrolling after the month\'s invoice was issued warns and leaves the invoice untouched', async () => {
  const L = SUB_STR[locale()];
  const T = SOU289_STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const month = currentMonth();

  const regular = await seedFormula(win, REGULAR_FORMULA);
  await seedFormula(win, EXAM_FORMULA);
  const { studentId } = await seedStudentViaBridge(win, YASSINE);
  const created = await createSubscriptionViaBridge(win, {
    studentId,
    formulaId: regular.formulaId,
    kind: 'regular',
    subjectIds: [regular.subjectId],
    startMonth: month,
  });
  expect(created.invoiceId).not.toBeNull();
  await issueInvoiceViaBridge(win, created.invoiceId!);

  // Open the student's enrollment tab in the UI and subscribe to exam-prep.
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.getByRole('row', { name: escapeRegExp(YASSINE.nameFr) }).getByRole('link', { name: escapeRegExp(YASSINE.nameFr) }).click();
  await gotoSubscriptionTab(win, L);
  await subscribeViaWizard(win, L, { formulaLabel: formulaName(locale(), EXAM_FORMULA), card: 'exam-prep' });

  // Clear, translated warning: subscription saved, formula NOT on the issued invoice.
  await expect(win.getByText(T.toast.issuedSkipped)).toBeVisible();
  await win.screenshot({ path: `test-results/sou289-s6-issued-warning-${locale()}.png` });

  // The subscription exists: the exam-prep card shows the formula as active.
  await expect(win.getByText(escapeRegExp(formulaName(locale(), EXAM_FORMULA))).first()).toBeVisible();

  // The issued invoice is untouched: still one invoice, one line, 200 MAD, issued.
  const invoices = (await listStudentInvoices(win, studentId)).filter((i) => i.month === month);
  expect(invoices).toHaveLength(1);
  expect(invoices[0]!.status).toBe('issued');
  expect(invoices[0]!.lines).toHaveLength(1);
  expect(invoices[0]!.totalMad).toBe(200 * 100);
});

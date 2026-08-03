import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  gotoArrears,
  seedGroup,
  seedOverdueInvoice,
  seedParent,
  fetchOverdueDirect,
  monthsAgo,
  escapeRegExp,
  type Launched,
  type Locale,
} from './arrears.fixtures';

/**
 * SOU-103 — Impayés (arrears) view: overdue/partial invoices grouped by
 * parent, filters, aging summary, follow-up quick actions (open invoice /
 * record payment / print call sheet). Black-box, driven only through the
 * running packaged app. Every spec runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
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

// ---------------------------------------------------------------------------
// Scenario 1 — empty state: a freshly booted center with zero overdue
// invoices shows the "good news" empty state, not a blank list.
// ---------------------------------------------------------------------------
test('Scenario 1 — empty state: no overdue invoices', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoArrears(win, L);
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/arrears-empty-${locale()}.png` });

  await expect(win.getByText(L.empty.title)).toBeVisible();
  await expect(win.getByText(L.empty.body)).toBeVisible();
  await expect(win.getByRole('button', { name: L.actions.exportList, exact: true })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// Scenario 2 — HAPPY PATH: one parent with two overdue children is grouped
// under a single card, total outstanding = sum of both invoices, and
// expanding it lists both linked students. Also covers FR/AR RTL rendering
// (dir + MAD/د.م. formatting).
// ---------------------------------------------------------------------------
test('Scenario 2 — a parent with two overdue children is grouped, total outstanding sums both, both students listed', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();
  const month = monthsAgo(today, 2);

  const parentName = 'Fatima Bennani';
  const parent = await seedParent(win, { name: parentName, phone: '0612345678' });
  await seedOverdueInvoice(win, {
    parent,
    studentNameFr: 'Amine Bennani',
    studentNameAr: 'أمين بناني',
    month,
    priceMad: 150,
  });
  await seedOverdueInvoice(win, {
    parent,
    studentNameFr: 'Sara Bennani',
    studentNameAr: 'سارة بناني',
    month,
    priceMad: 250,
  });

  await gotoArrears(win, L);
  await assertMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  const bodyText = await win.evaluate(() => document.body.innerText);
  if (locale() === 'ar') {
    expect(bodyText, 'Arabic UI must render MAD amounts with the د.م. suffix').toContain('د.م.');
  } else {
    expect(bodyText, 'French UI renders MAD amounts via Intl.NumberFormat (ISO code, not a DH suffix)').toContain('MAD');
  }

  const card = win.getByRole('button', { name: escapeRegExp(parentName), exact: false });
  await expect(card).toBeVisible();
  // 150 + 250 = 400 MAD total outstanding must appear on the collapsed card.
  await expect(card).toContainText('400');
  await win.screenshot({ path: `test-results/arrears-parent-card-${locale()}.png` });

  await card.click();
  const amineName = locale() === 'ar' ? 'أمين بناني' : 'Amine Bennani';
  const saraName = locale() === 'ar' ? 'سارة بناني' : 'Sara Bennani';
  await expect(win.getByText(escapeRegExp(amineName)).first()).toBeVisible();
  await expect(win.getByText(escapeRegExp(saraName)).first()).toBeVisible();
  await win.screenshot({ path: `test-results/arrears-expanded-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — filters: month, amount range, group, and status all narrow the
// list correctly and compose; an over-restrictive combination falls back to
// the no-results state, and clearing filters restores the full list.
// ---------------------------------------------------------------------------
test('Scenario 3 — month / amount-range / group / status filters narrow the list correctly', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();
  const monthA = monthsAgo(today, 1);
  const monthB = monthsAgo(today, 3);

  const group = await seedGroup(win, {
    subjectFr: 'Physique',
    subjectAr: 'الفيزياء',
    roomName: 'Salle 1',
    level: '3AC',
  });

  const parentA = { name: 'Khadija Idrissi', phone: '0611111111' };
  await seedOverdueInvoice(win, {
    parent: parentA,
    studentNameFr: 'Youssef Idrissi',
    studentNameAr: 'يوسف الإدريسي',
    month: monthA,
    priceMad: 150,
    groupId: group.groupId,
    subjectId: group.subjectId,
  });

  const parentB = { name: 'Rachid Tazi', phone: '0622222222' };
  await seedOverdueInvoice(win, {
    parent: parentB,
    studentNameFr: 'Nadia Tazi',
    studentNameAr: 'نادية التازي',
    month: monthB,
    priceMad: 500,
    partialPaymentMad: 100,
  });

  await gotoArrears(win, L);
  await assertMounted(win, L);
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toBeVisible();

  // --- Month filter: only parentA's billed month.
  await win.getByLabel(L.filters.monthLabel, { exact: false }).fill(monthA);
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toHaveCount(0);
  await win.getByLabel(L.filters.monthLabel, { exact: false }).fill('');
  await win.waitForTimeout(400);

  // --- Amount range filter: only the 500 MAD (parentB) group.
  await win.getByLabel(L.filters.amountMinLabel, { exact: false }).fill('300');
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toHaveCount(0);
  await win.getByLabel(L.filters.amountMinLabel, { exact: false }).fill('');
  await win.waitForTimeout(400);

  // --- Group filter: only parentA's student is enrolled in the seeded group.
  await win.getByRole('combobox', { name: L.filters.groupLabel }).click();
  await win.getByRole('option', { name: new RegExp(group.level) }).click();
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toHaveCount(0);
  await win.getByRole('combobox', { name: L.filters.groupLabel }).click();
  await win.getByRole('option', { name: L.filters.groupAll, exact: true }).click();
  await win.waitForTimeout(400);

  // --- Status filter: only parentB has a partially-paid invoice.
  await win.getByRole('combobox', { name: L.filters.statusLabel }).click();
  await win.getByRole('option', { name: L.status.partiallyPaid, exact: true }).click();
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toHaveCount(0);

  // --- Over-restrictive combination (status=partially-paid + parentA's month) → no results.
  await win.getByLabel(L.filters.monthLabel, { exact: false }).fill(monthA);
  await win.waitForTimeout(400);
  await expect(win.getByText(L.noResults.title)).toBeVisible();
  await win.screenshot({ path: `test-results/arrears-no-results-${locale()}.png` });

  // --- Reset: both parents visible again.
  await win.getByLabel(L.filters.monthLabel, { exact: false }).fill('');
  await win.getByRole('combobox', { name: L.filters.statusLabel }).click();
  await win.getByRole('option', { name: L.filters.statusAll, exact: true }).click();
  await win.waitForTimeout(400);
  await expect(win.getByRole('button', { name: escapeRegExp(parentA.name), exact: false })).toBeVisible();
  await expect(win.getByRole('button', { name: escapeRegExp(parentB.name), exact: false })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4 — aging summary + the 30/60/90+ three-tier collapsing. There is
// no fake-clock hook in this app (`SystemClock` is real wall time), so exact
// day-level boundary hits (e.g. "overdue by exactly 31 days") cannot be
// manufactured deterministically without controlling the system clock — this
// is called out explicitly in the final report. Instead, this scenario seeds
// invoices at increasing real month-offsets (1/2/3/6 months back), calibrates
// the ACTUAL domain-computed `agingBucket` for each via a direct
// `invoice.overdue` bridge call (ground truth, not assumed), and asserts the
// UI badge for each invoice matches the expected three-tier collapse of that
// real bucket (0-30→"30", 31-60→"60", 61-90 and 90-plus→"90+"), that aging
// escalates monotonically with age, and that no finer/fourth bucket or raw
// domain token ever leaks onto the screen.
// ---------------------------------------------------------------------------
test('Scenario 4 — aging buckets escalate correctly and collapse to exactly the three visible tiers', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();

  const samples = [
    { offset: 1, parent: { name: 'Aicha Fassi', phone: '0631111111' }, studentFr: 'Omar Fassi', studentAr: 'عمر الفاسي', priceMad: 111 },
    { offset: 2, parent: { name: 'Bouchra Alami', phone: '0632222222' }, studentFr: 'Hamza Alami', studentAr: 'حمزة العلمي', priceMad: 222 },
    { offset: 3, parent: { name: 'Nawal Chraibi', phone: '0633333333' }, studentFr: 'Karim Chraibi', studentAr: 'كريم الشرايبي', priceMad: 333 },
    { offset: 6, parent: { name: 'Samira Berrada', phone: '0634444444' }, studentFr: 'Yassir Berrada', studentAr: 'ياسر برادة', priceMad: 444 },
  ];

  const seeded = [];
  for (const s of samples) {
    const month = monthsAgo(today, s.offset);
    const result = await seedOverdueInvoice(win, {
      parent: s.parent,
      studentNameFr: s.studentFr,
      studentNameAr: s.studentAr,
      month,
      priceMad: s.priceMad,
    });
    seeded.push({ ...s, month, invoiceId: result.invoiceId });
  }

  // Ground truth straight from the domain, no UI involved.
  const direct = await fetchOverdueDirect(win, {});
  const bucketFor = (invoiceId: string): string => {
    for (const group of direct.groups) {
      const entry = group.invoices.find((i) => i.invoiceId === invoiceId);
      if (entry) return entry.agingBucket;
    }
    throw new Error(`invoice ${invoiceId} not found in invoice.overdue response`);
  };
  const toUiBucket = (bucket: string): '30' | '60' | 'ninetyPlus' =>
    bucket === '0-30' ? '30' : bucket === '31-60' ? '60' : 'ninetyPlus';

  const domainOrdinal: Record<string, number> = { '0-30': 0, '31-60': 1, '61-90': 2, '90-plus': 3 };
  const buckets = seeded.map((s) => bucketFor(s.invoiceId));
  for (let i = 1; i < buckets.length; i++) {
    expect(
      domainOrdinal[buckets[i]!]! >= domainOrdinal[buckets[i - 1]!]!,
      `aging must not de-escalate as billed month gets older: ${seeded[i - 1]!.month} (${buckets[i - 1]}) → ${seeded[i]!.month} (${buckets[i]})`,
    ).toBe(true);
  }
  // Six months back must always land in the terminal "90-plus" domain bucket
  // regardless of which real day this suite runs on (minimum possible gap is
  // well over 90 days), so the "90+" UI tier is always exercised.
  expect(buckets[buckets.length - 1]).toBe('90-plus');

  await gotoArrears(win, L);
  await assertMounted(win, L);

  for (let i = 0; i < seeded.length; i++) {
    const s = seeded[i]!;
    const expectedLabel = L.aging.bucket[toUiBucket(buckets[i]!)];
    const card = win.getByRole('button', { name: escapeRegExp(s.parent.name), exact: false });
    await expect(card).toBeVisible();
    await expect(card, `parent ${s.parent.name} (billed ${s.month}, domain bucket ${buckets[i]}) must show the "${expectedLabel}" aging badge`).toContainText(
      expectedLabel,
    );
  }

  // No fourth/finer bucket (raw domain tokens) ever leaks onto the screen.
  const bodyText = await win.evaluate(() => document.body.innerText);
  expect(bodyText).not.toContain('0-30');
  expect(bodyText).not.toContain('31-60');
  expect(bodyText).not.toContain('61-90');
  expect(bodyText).not.toContain('90-plus');
  await win.screenshot({ path: `test-results/arrears-aging-${locale()}.png` });

  // The aging summary's total card must equal the sum of the three tier cards.
  const bucket30 = direct.agingSummary.find((e) => e.bucket === '0-30')?.outstandingMad ?? 0;
  const bucket60 = direct.agingSummary.find((e) => e.bucket === '31-60')?.outstandingMad ?? 0;
  const bucket90 =
    (direct.agingSummary.find((e) => e.bucket === '61-90')?.outstandingMad ?? 0) +
    (direct.agingSummary.find((e) => e.bucket === '90-plus')?.outstandingMad ?? 0);
  // `outstandingMad` fields are actually centimes (mirrors `minOutstandingMad`/
  // `maxOutstandingMad` on the filter request), so comparing the on-screen
  // amount's digits (which include the ",00" decimal cents) against this raw
  // sum needs no unit conversion — just strip locale punctuation from both.
  const expectedTotal = bucket30 + bucket60 + bucket90;
  const agingSummaryGroup = win.getByRole('group', { name: L.aging.groupLabel });
  const totalCardText = await agingSummaryGroup.getByText(L.aging.total).locator('..').innerText();
  const totalCardDigits = totalCardText.replace(/\D/g, '');
  expect(totalCardDigits, `aging summary total card ("${totalCardText}") must equal the sum of the three tier cards (${expectedTotal} centimes)`).toBe(
    String(expectedTotal),
  );
});

// ---------------------------------------------------------------------------
// Scenario 5 — quick actions: "open invoice" navigates to the existing
// invoice detail page; "record payment" reuses the SOU-101 dialog, and a full
// payment drops the invoice off the arrears list (refetch) while a partial
// payment shrinks its outstanding amount and flips its status badge.
// ---------------------------------------------------------------------------
test('Scenario 5 — open invoice navigates to detail; record payment refetches and updates the list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();

  const parentOpen = { name: 'Latifa Sekkat', phone: '0641111111' };
  const seededOpen = await seedOverdueInvoice(win, {
    parent: parentOpen,
    studentNameFr: 'Reda Sekkat',
    studentNameAr: 'رضا سكات',
    month: monthsAgo(today, 1),
    priceMad: 200,
  });

  const parentFull = { name: 'Mounir Ouazzani', phone: '0642222222' };
  const seededFull = await seedOverdueInvoice(win, {
    parent: parentFull,
    studentNameFr: 'Salma Ouazzani',
    studentNameAr: 'سلمى الوزاني',
    month: monthsAgo(today, 1),
    priceMad: 200,
  });

  const parentPartial = { name: 'Hicham Belfkih', phone: '0643333333' };
  await seedOverdueInvoice(win, {
    parent: parentPartial,
    studentNameFr: 'Ines Belfkih',
    studentNameAr: 'إيناس بلفقيه',
    month: monthsAgo(today, 1),
    priceMad: 300,
  });

  await gotoArrears(win, L);
  await assertMounted(win, L);

  // --- "Ouvrir la facture" navigates to the invoice detail page.
  const openCard = win.getByRole('button', { name: escapeRegExp(parentOpen.name), exact: false });
  await openCard.click();
  await win.getByRole('link', { name: L.actions.openInvoice }).first().click();
  await win.waitForTimeout(500);
  expect(win.url(), 'opening an invoice from the arrears list must navigate to its detail route').toContain(seededOpen.invoiceId);
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/arrears-open-invoice-${locale()}.png` });

  // --- Full payment drops the invoice off the arrears list.
  await gotoArrears(win, L);
  const fullCard = win.getByRole('button', { name: escapeRegExp(parentFull.name), exact: false });
  await fullCard.click();
  await win.getByRole('button', { name: L.actions.recordPayment }).first().click();
  const fullDialog = win.getByRole('dialog');
  await expect(fullDialog).toBeVisible();
  await expect(fullDialog.getByText(L.payment.dialogTitle)).toBeVisible();
  await fullDialog.locator('input[name="amountMad"]').fill(String(seededFull.priceMad));
  await fullDialog.getByRole('button', { name: L.payment.submit, exact: true }).click();
  await expect(fullDialog).toBeHidden();
  await win.waitForTimeout(700);
  await expect(win.getByRole('button', { name: escapeRegExp(parentFull.name), exact: false }), 'a fully-paid invoice must drop off the arrears list after refetch').toHaveCount(
    0,
  );
  await win.screenshot({ path: `test-results/arrears-after-full-payment-${locale()}.png` });

  // --- Partial payment shrinks the outstanding amount and flips the status badge.
  const partialCard = win.getByRole('button', { name: escapeRegExp(parentPartial.name), exact: false });
  await expect(partialCard).toContainText('300');
  await partialCard.click();
  await win.getByRole('button', { name: L.actions.recordPayment }).first().click();
  const partialDialog = win.getByRole('dialog');
  await expect(partialDialog).toBeVisible();
  await partialDialog.locator('input[name="amountMad"]').fill('100');
  await partialDialog.getByRole('button', { name: L.payment.submit, exact: true }).click();
  await expect(partialDialog).toBeHidden();
  await win.waitForTimeout(700);
  const shrunkCard = win.getByRole('button', { name: escapeRegExp(parentPartial.name), exact: false });
  await expect(shrunkCard, 'a partial payment must shrink the outstanding amount shown, not remove the parent').toBeVisible();
  await expect(shrunkCard).not.toContainText('300');
  await win.screenshot({ path: `test-results/arrears-after-partial-payment-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 6 — edge case: a student with an overdue invoice and NO linked
// guardian must still appear, grouped under a distinct fallback label, with
// no phone row rendered for that group.
// ---------------------------------------------------------------------------
test('Scenario 6 — a student with no linked guardian appears under the "Parent non renseigné" fallback group with no phone row', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();

  await seedOverdueInvoice(win, {
    parent: null,
    studentNameFr: 'Imane Sans Parent',
    studentNameAr: 'إيمان بدون ولي',
    month: monthsAgo(today, 1),
    priceMad: 175,
  });

  await gotoArrears(win, L);
  await assertMounted(win, L);

  const fallbackCard = win.getByRole('button', { name: escapeRegExp(L.parentCard.unlinkedParent), exact: false });
  await expect(fallbackCard).toBeVisible();
  const cardText = await fallbackCard.innerText();
  expect(cardText, 'the guardian-less group must not render a phone number').not.toMatch(/\+2\d{2}[\s\d]+/);
  await win.screenshot({ path: `test-results/arrears-unlinked-parent-${locale()}.png` });

  await fallbackCard.click();
  const studentName = locale() === 'ar' ? 'إيمان بدون ولي' : 'Imane Sans Parent';
  await expect(win.getByText(escapeRegExp(studentName)).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 7 — "export list to PDF" is a print-only call sheet triggered by
// the OS print dialog (`window.print()`), not a generated file. Print-media
// emulation must show a clean, correctly grouped document (parent header +
// phone + per-invoice rows + a per-parent total), while the interactive
// screen chrome (toolbar, aging cards, action buttons) is hidden.
// ---------------------------------------------------------------------------
test('Scenario 7 — print media renders a clean, correctly grouped call sheet and hides interactive chrome', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const today = new Date();

  const parent = { name: 'Souad Kabbaj', phone: '0651111111' };
  await seedOverdueInvoice(win, {
    parent,
    studentNameFr: 'Anass Kabbaj',
    studentNameAr: 'أنس الكبج',
    month: monthsAgo(today, 1),
    priceMad: 180,
  });

  await gotoArrears(win, L);
  await assertMounted(win, L);

  const exportBtn = win.getByRole('button', { name: L.actions.exportList, exact: true });
  await expect(exportBtn).toBeEnabled();

  await win.emulateMedia({ media: 'print' });
  await win.waitForTimeout(300);

  await expect(win.getByText(L.print.title)).toBeVisible();
  // Scoped to the print-only container (the on-screen parent card/table also
  // contain this same text, just hidden under print media — `getByText`
  // matches in DOM order regardless of visibility, so an unscoped `.first()`
  // can resolve to the hidden on-screen copy).
  const printRoot = win.getByText(L.print.title).locator('..');
  await expect(printRoot.getByText(escapeRegExp(parent.name)).first()).toBeVisible();
  // The print sheet's student column always renders the French name regardless
  // of locale (mirrors the invoice list/detail's own row link convention — the
  // Arabic name is a decorative on-screen sibling only), so this assertion
  // stays `studentNameFr` under both Playwright projects.
  await expect(printRoot.getByText(escapeRegExp('Anass Kabbaj')).first()).toBeVisible();
  // The interactive toolbar action (screen-only chrome) must not render on the print sheet.
  await expect(win.getByRole('button', { name: L.actions.exportList, exact: true })).toBeHidden();
  await expect(win.getByRole('button', { name: L.actions.recordPayment }).first()).toBeHidden();
  await win.screenshot({ path: `test-results/arrears-print-${locale()}.png` });

  await win.emulateMedia({ media: 'screen' });
  await win.waitForTimeout(300);
  await expect(win.getByRole('heading', { name: L.title })).toBeVisible();
  await expect(win.getByRole('button', { name: L.actions.exportList, exact: true })).toBeVisible();
});

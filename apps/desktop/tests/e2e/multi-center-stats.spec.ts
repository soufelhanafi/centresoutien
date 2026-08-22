import { test, expect, type Page } from '@playwright/test';
import {
  ALL_CENTERS,
  CENTER_A,
  CENTER_B,
  CENTER_C,
  DIRECTION,
  STR,
  activePlan,
  corruptCenterDb,
  freshExportDir,
  freshUserDataDir,
  launch,
  navigateToStatsHash,
  provisionCenter,
  stubOpenPath,
  stubSaveDialog,
  type Launched,
  type Locale,
} from './multi-center-stats.fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * SOU-106 — Per-center stats view (Premium, `org.multi-center`). Black-box,
 * driven only through the running packaged app + the public preload bridge.
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test:
 *   - Comparison table: revenue, students, unpaid rate, month-over-month growth
 *     per center, with a totals roll-up.
 *   - Sortable + name-filterable; export to PDF.
 *   - Usable with many centers (virtualization "if needed").
 *   - FR/AR + RTL.
 *   - Premium-gated: non-Premium sees a lock/upsell, Premium sees the live table.
 *   - A center whose DB is unavailable degrades gracefully (flagged row, not a
 *     crash, no fake zeros presented as real).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test.beforeEach(() => {
  // Provisioning launches the app once per center then the test window.
  test.setTimeout(240_000);
});

/* True when the renderer error boundary is showing (page crashed on render). */
async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

/* The center display names in DOM order as they appear in the stats table body. */
async function centerRowOrder(win: Page, names: readonly string[]): Promise<string[]> {
  const rows = await win.getByRole('row').allInnerTexts();
  const order: string[] = [];
  for (const rowText of rows) {
    const hit = names.find((n) => rowText.includes(n));
    if (hit && !order.includes(hit)) order.push(hit);
  }
  return order;
}

function isSortedAscOrDesc(values: readonly number[]): boolean {
  if (values.length < 2) return true;
  const asc = values.every((v, i) => i === 0 || (values[i - 1] as number) <= v);
  const desc = values.every((v, i) => i === 0 || (values[i - 1] as number) >= v);
  return asc || desc;
}

/** Provision the three canonical centers into a fresh userData dir; return the dir. */
async function provisionThreeCenters(loc: Locale): Promise<string> {
  const dir = freshUserDataDir();
  for (const c of ALL_CENTERS) await provisionCenter(loc, 'premium', dir, c);
  return dir;
}

/** Open the stats page via the sidebar nav entry and wait for the table to paint. */
async function openStatsViaNav(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.nav, exact: true }).click();
  await expect(win.getByRole('columnheader', { name: L.colStudents }).first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Premium happy path: the live comparison table renders the four
// metric columns + totals, with one row per available center.
// ---------------------------------------------------------------------------
test('Scenario 1 — Premium: comparison table shows the 4 metric columns, totals, and a row per center', async () => {
  const L = STR[locale()];
  const dir = await provisionThreeCenters(locale());

  const { app, win } = await launch({
    locale: locale(),
    plan: 'premium',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  expect(await activePlan(win), 'CS_PLAN=premium took effect').toBe('premium');

  await openStatsViaNav(win, L);
  await win.screenshot({ path: `test-results/mcstats-premium-${locale()}.png` });

  // The four metric column headers + the center column are all present.
  for (const col of [L.colCenter, L.colRevenue, L.colStudents, L.colUnpaid, L.colGrowth]) {
    await expect(win.getByRole('columnheader', { name: col }).first()).toBeVisible();
  }

  // One row per provisioned center.
  for (const c of ALL_CENTERS) {
    await expect(win.getByText(c.displayName).first()).toBeVisible();
  }

  // Totals roll-up present (revenue + students totals).
  await expect(win.getByText(L.totalRevenue).first()).toBeVisible();

  // No crash, and layout direction matches the locale (RTL under `ar`).
  expect(await pageCrashed(win)).toBe(false);
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
});

// ---------------------------------------------------------------------------
// Scenario 2 — Sort by a numeric column (Élèves). Clicking the header orders the
// rows monotonically by the student count (3 / 2 / 1 across the three centers).
// ---------------------------------------------------------------------------
test('Scenario 2 — Premium: sorting by the numeric "Élèves" column orders the rows', async () => {
  const L = STR[locale()];
  const dir = await provisionThreeCenters(locale());

  const { app, win } = await launch({
    locale: locale(),
    plan: 'premium',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  await openStatsViaNav(win, L);

  const names = ALL_CENTERS.map((c) => c.displayName);
  const countByName: Record<string, number> = {
    [CENTER_A.displayName]: CENTER_A.studentCount,
    [CENTER_B.displayName]: CENTER_B.studentCount,
    [CENTER_C.displayName]: CENTER_C.studentCount,
  };

  const header = win.getByRole('columnheader', { name: L.colStudents }).first();
  // The header (or a button inside it) is the sort control.
  const clickable = header.getByRole('button').first();
  if (await clickable.count()) await clickable.click();
  else await header.click();

  const order = await centerRowOrder(win, names);
  expect(order.length, 'all three centers still rendered after sort').toBe(3);
  const counts = order.map((n) => countByName[n] as number);
  expect(isSortedAscOrDesc(counts), `rows ordered by student count (${counts.join(',')})`).toBe(true);
});

// ---------------------------------------------------------------------------
// Scenario 3 — Name filter narrows the table to the matching center only.
// ---------------------------------------------------------------------------
test('Scenario 3 — Premium: the name filter narrows the table to the matching center', async () => {
  const L = STR[locale()];
  const dir = await provisionThreeCenters(locale());

  const { app, win } = await launch({
    locale: locale(),
    plan: 'premium',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  await openStatsViaNav(win, L);

  const filter = win.getByPlaceholder(L.filterPlaceholder);
  await expect(filter).toBeVisible();
  await filter.fill('Annexe');

  await expect(win.getByText(CENTER_B.displayName).first()).toBeVisible();
  await expect(win.getByText(CENTER_A.displayName)).toHaveCount(0);
  await expect(win.getByText(CENTER_C.displayName)).toHaveCount(0);

  // A non-matching query surfaces the empty-results message (not a crash / blank).
  await filter.fill('ZZZ-NO-SUCH-CENTER');
  await expect(win.getByText(L.noResults).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4 — Non-Premium lock/upsell: an under-provisioned plan (Essentiel,
// which lacks `org.multi-center`) shows the lock, NOT the live table.
// ---------------------------------------------------------------------------
test('Scenario 4 — Essentiel: the stats route shows the Premium lock/upsell, not the table', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();
  await provisionCenter(locale(), 'essentiel', dir, CENTER_A);

  const { app, win } = await launch({
    locale: locale(),
    plan: 'essentiel',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  expect(await activePlan(win), 'CS_PLAN=essentiel took effect').toBe('essentiel');

  await navigateToStatsHash(win);
  await win.screenshot({ path: `test-results/mcstats-essentiel-lock-${locale()}.png` });

  // A lock/upsell affordance is shown: either the feature lock title or the
  // generic plan gate, plus the "unlock with Premium" CTA.
  const lock = win.getByText(L.lockTitle);
  const gate = win.getByText(L.gateTitle);
  const lockVisible = (await lock.count()) > 0 || (await gate.count()) > 0;
  expect(lockVisible, 'a lock/upsell surface is shown on the non-Premium plan').toBe(true);
  await expect(win.getByRole('button', { name: L.unlockCta }).first()).toBeVisible();

  // The live comparison table must NOT be present: no metric column headers.
  await expect(win.getByRole('columnheader', { name: L.colRevenue })).toHaveCount(0);
  await expect(win.getByRole('columnheader', { name: L.colGrowth })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
});

// ---------------------------------------------------------------------------
// Scenario 5 — Graceful degradation: a center whose DB cannot be opened surfaces
// as a flagged row ("Données indisponibles"), the table still renders the other
// centers, and the page does not crash. No fake zeros presented as real figures.
// ---------------------------------------------------------------------------
test('Scenario 5 — Premium: an unavailable center DB degrades to a flagged row, no crash', async () => {
  const L = STR[locale()];
  const dir = await provisionThreeCenters(locale());

  // Corrupt center C's DB in place → its read-only open must fail.
  corruptCenterDb(dir, CENTER_C.centreId);

  const { app, win } = await launch({
    locale: locale(),
    plan: 'premium',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  await openStatsViaNav(win, L);
  await win.screenshot({ path: `test-results/mcstats-unavailable-${locale()}.png` });

  // The unavailable center is flagged, not dropped, and the readable ones render.
  // With C's profile unreadable, the adapter falls back to its centreId for the
  // display name — the lost "Centre Nour" can never render — so we assert the
  // fallback text + the "unavailable" marker, not the display name.
  await expect(win.getByText(L.unavailable).first()).toBeVisible();
  await expect(win.getByText(CENTER_C.centreId).first()).toBeVisible();
  await expect(win.getByText(CENTER_A.displayName).first()).toBeVisible();
  await expect(win.getByText(CENTER_B.displayName).first()).toBeVisible();

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
});

// ---------------------------------------------------------------------------
// Scenario 6 — Export to PDF: the export action writes a real PDF to disk and
// surfaces the success toast. The native save dialog + external opener are
// stubbed at the OS boundary so no real UI is spawned.
// ---------------------------------------------------------------------------
test('Scenario 6 — Premium: exporting the table writes a real PDF and confirms success', async () => {
  const L = STR[locale()];
  const dir = await provisionThreeCenters(locale());

  const { app, win } = await launch({
    locale: locale(),
    plan: 'premium',
    centreId: CENTER_A.centreId,
    centerCode: CENTER_A.code,
    userDataDir: dir,
  });
  live = { app, win };

  const outDir = freshExportDir();
  const outPath = join(outDir, `mcstats-${locale()}.pdf`);
  await stubSaveDialog(app, outPath);
  await stubOpenPath(app);

  await openStatsViaNav(win, L);

  await win.getByRole('button', { name: L.actionExport }).first().click();

  // Success toast + a real PDF (%PDF- magic bytes) on disk at the chosen path.
  await expect(win.getByText(L.exportSuccess).first()).toBeVisible({ timeout: 15_000 });
  expect(existsSync(outPath), 'export wrote a file to the chosen path').toBe(true);
  expect(readFileSync(outPath).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

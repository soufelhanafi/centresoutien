import { test, expect } from '@playwright/test';
import {
  STR,
  DATE,
  REF,
  seedGeneratedSessions,
  narrowMondayOverride,
  addHoliday,
  readWeek,
  gotoAudit,
  launch,
  auditRows,
  rowForDate,
  confirmDialog,
  pageCrashed,
  type Launched,
  type Locale,
} from './schedule-audit.fixtures';

/**
 * SOU-201 — "Audit du planning" report page. Black-box, driven only through the
 * running packaged app + the public preload bridge. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * The materialized window is Mon 2026-08-17 + Mon 2026-08-24 (both future vs the
 * mid-August system clock). Occurrences are generated FIRST, then stranded by an
 * override and/or a holiday — matching the "added after a session was generated"
 * acceptance wording.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const RAW_ID = /rom_|tch_|sub_|grp_|ses_|wrs_/;

// ---------------------------------------------------------------------------
// Scenario 1 — a center-hours override strands a materialized occurrence; it
// appears in the audit list with an "outside hours" badge and shows subject /
// room / teacher NAMES + date + time (never raw ids).
// ---------------------------------------------------------------------------
test('Scenario 1 — override strands an occurrence: "outside hours" row shows names, date, time (not ids)', async () => {
  const L = STR[locale()];
  const D = DATE[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedGeneratedSessions(win, '2026-08-16', '2026-08-18'); // materializes only Mon 08-17
  await narrowMondayOverride(win, '2026-08-16', '2026-08-18'); // Monday 09:00–14:00 → 15:00–17:00 stranded
  await gotoAudit(win);

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await expect(win.getByRole('heading', { name: L.pageTitle }).first()).toBeVisible();
  await expect(win.getByText(L.subtitle)).toBeVisible();

  await expect(auditRows(win)).toHaveCount(1);
  const row = rowForDate(win, D.d17);
  await expect(row).toBeVisible();
  await expect(row.getByText(L.reasonOutsideHours)).toBeVisible();

  const subjectName = locale() === 'ar' ? REF.subjectAr : REF.subjectFr;
  const teacherName = locale() === 'ar' ? REF.teacherAr : REF.teacherFr;
  await expect(row).toContainText(subjectName);
  await expect(row).toContainText(REF.groupLevel);
  await expect(row).toContainText(REF.room);
  await expect(row).toContainText(teacherName);
  await expect(row).toContainText(D.d17);
  await expect(row).toContainText('15:00');
  await expect(row).toContainText('17:00');

  // The row must render NAMES, never raw entity ids.
  const rowText = (await row.innerText()).trim();
  expect(rowText).not.toMatch(RAW_ID);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou201-s1-outside-hours-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — a holiday added after generation flags the occurrence with an
// "on holiday" badge; when an occurrence is BOTH outside hours AND on a holiday
// the reason shown is the holiday (precedence). Both rows in one setup:
//   08-17 → outside hours only  → "Hors horaires"
//   08-24 → outside hours + holiday → "Jour férié" (holiday wins)
// ---------------------------------------------------------------------------
test('Scenario 2 — holiday badge appears, and a both-affected occurrence shows the holiday reason', async () => {
  const L = STR[locale()];
  const D = DATE[locale()];
  live = await launch(locale());
  const win = live.win;

  await seedGeneratedSessions(win, '2026-08-16', '2026-08-25'); // Mon 08-17 + Mon 08-24
  await narrowMondayOverride(win, '2026-08-16', '2026-08-25'); // both Mondays now outside hours
  await addHoliday(win, '2026-08-24'); // 08-24 is now ALSO a holiday
  await gotoAudit(win);

  await expect(auditRows(win)).toHaveCount(2);

  const outsideRow = rowForDate(win, D.d17);
  await expect(outsideRow.getByText(L.reasonOutsideHours)).toBeVisible();

  const holidayRow = rowForDate(win, D.d24);
  await expect(holidayRow.getByText(L.reasonHoliday)).toBeVisible();
  // Precedence: the both-affected row shows the holiday reason, NOT the hours reason.
  await expect(holidayRow.getByText(L.reasonOutsideHours)).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou201-s2-holiday-precedence-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — THE money scenario (data-loss guard). Cancel one stranded row:
// the confirm dialog states only that date is removed; after confirm the row
// disappears while the recurring weekly template AND the other dated occurrence
// both survive.
// ---------------------------------------------------------------------------
test('Scenario 3 — cancelling one stranded occurrence keeps the weekly template and the other date', async () => {
  const L = STR[locale()];
  const D = DATE[locale()];
  live = await launch(locale());
  const win = live.win;

  const seeded = await seedGeneratedSessions(win, '2026-08-16', '2026-08-25'); // 08-17 + 08-24
  await narrowMondayOverride(win, '2026-08-16', '2026-08-25'); // both stranded (outside hours)

  const weekBefore = await readWeek(win);
  const templateBefore = weekBefore.find((s) => s.id === seeded.recurringSessionId);
  expect(templateBefore, 'the weekly recurring template exists before cancel').toBeTruthy();

  await gotoAudit(win);
  await expect(auditRows(win)).toHaveCount(2);

  // Cancel the 08-17 occurrence.
  await rowForDate(win, D.d17).getByRole('button', { name: L.cancelRowBtn }).click();

  const dialog = confirmDialog(win);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(L.dialogTitle);
  // The dialog must promise ONLY this date is removed (weekly + other dates unchanged).
  await expect(dialog).toContainText(L.dialogBody);
  await dialog.getByRole('button', { name: L.dialogConfirm, exact: true }).click();

  // The cancelled row is gone; the OTHER stranded date survives.
  await expect(rowForDate(win, D.d17)).toHaveCount(0);
  await expect(rowForDate(win, D.d24)).toBeVisible();
  await expect(auditRows(win)).toHaveCount(1);

  // The recurring weekly template is untouched (same id, same day/time).
  const weekAfter = await readWeek(win);
  const templateAfter = weekAfter.find((s) => s.id === seeded.recurringSessionId);
  expect(templateAfter, 'the weekly recurring template survives the per-date cancel').toBeTruthy();
  expect(templateAfter).toMatchObject({ dayOfWeek: 1, start: '15:00', end: '17:00' });

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou201-s3-cancel-one-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — empty state. No occurrence is stranded → the reassuring "all
// good" message, not an error.
// ---------------------------------------------------------------------------
test('Scenario 4 — no stranded sessions shows the good empty state, not an error', async () => {
  const L = STR[locale()];
  live = await launch(locale());
  const win = live.win;

  // Materialize occurrences but strand nothing (no override, no holiday).
  await seedGeneratedSessions(win, '2026-08-16', '2026-08-25');
  await gotoAudit(win);

  await expect(win.getByRole('heading', { name: L.pageTitle }).first()).toBeVisible();
  await expect(win.getByText(L.emptyTitle)).toBeVisible();
  await expect(win.getByText(L.emptySubtitle)).toBeVisible();
  await expect(auditRows(win)).toHaveCount(0);
  await expect(win.getByRole('button', { name: L.cancelRowBtn })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou201-s4-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — feature gating. With `settings.center-hours` dropped from the
// plan, the nav entry is locked (no longer a navigable link) and the route
// renders the plan gate instead of the report.
// ---------------------------------------------------------------------------
test('Scenario 5 — the page/nav entry is gated by settings.center-hours', async () => {
  const L = STR[locale()];
  live = await launch(locale(), { omitFeatures: ['settings.center-hours'] });
  const win = live.win;
  await win.reload();
  await win.waitForLoadState('domcontentloaded');

  const nav = win.getByRole('navigation').first();
  // The audit entry is no longer a live link — it is a locked control.
  await expect(nav.getByRole('link', { name: L.navAudit, exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: L.navAudit, exact: true })).toBeVisible();

  await win.evaluate(() => {
    window.location.hash = '#/schedule-audit';
  });
  await win.waitForTimeout(700);

  await expect(win.getByText(L.gateTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.gateCta })).toBeVisible();
  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou201-s5-gated-${locale()}.png` });
});

import { test, expect } from '@playwright/test';
import {
  OV,
  CURRENT_WEEK,
  OTHER_WEEK,
  MONDAY,
  boot,
  seedRoom,
  gotoHoursTab,
  fillOverrideDialog,
  submitOverride,
  gotoPlanner,
  closedOverlays,
  iftarGapOverlay,
  tryCreateSession,
  readWeek,
  pageCrashed,
  type Launched,
  type Locale,
} from './center-hours-overrides.fixtures';

/**
 * SOU-165 — dated center-hours override (Ramadan). Black-box, driven only
 * through the running app + public preload bridge. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const IFTAR: [{ open: string; close: string }, { open: string; close: string }] = [
  { open: '14:00', close: '17:00' },
  { open: '21:00', close: '23:00' },
];

// ---------------------------------------------------------------------------
// Scenario 1 — create an override with a date range + per-weekday windows,
// including a day with TWO windows (iftar break). It saves and appears in the
// list.
// ---------------------------------------------------------------------------
test('Scenario 1 — creates an override with an iftar two-window day and it appears in the list', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;

  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  await gotoHoursTab(win, L);
  await expect(win.getByText(L.emptyTitle)).toBeVisible();

  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: IFTAR,
  });
  await submitOverride(dialog, L);
  await dialog.waitFor({ state: 'detached' });

  const region = win.getByRole('region', { name: L.regionTitle });
  await expect(region.getByRole('button', { name: L.archiveAction })).toBeVisible();
  await expect(win.getByText(L.emptyTitle)).toHaveCount(0);
  // The saved day carries TWO windows (iftar break): both fragments are listed.
  await expect(region).toContainText('14:00');
  await expect(region).toContainText('17:00');
  await expect(region).toContainText('21:00');
  await expect(region).toContainText('23:00');

  await win.screenshot({ path: `test-results/sou165-s1-create-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — validation. Overlapping windows in a day, and close <= open, are
// rejected with an INLINE error (not a crash) — nothing silently saved.
// ---------------------------------------------------------------------------
test('Scenario 2a — overlapping windows in a day are rejected with an inline error', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHoursTab(win, L);

  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: [
      { open: '14:00', close: '17:00' },
      { open: '16:00', close: '19:00' }, // overlaps the first window
    ],
  });
  await submitOverride(dialog, L);
  await win.waitForTimeout(500);

  // Not a crash, and not silently saved (dialog stays open).
  expect(await pageCrashed(win)).toBe(false);
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.createSuccess)).toHaveCount(0);
  // Acceptance: an inline error explains why.
  await expect(dialog.getByText(L.errWindowsOverlap)).toBeVisible();

  await win.screenshot({ path: `test-results/sou165-s2a-overlap-${locale()}.png` });
});

test('Scenario 2b — a window whose close is before its open is rejected with an inline error', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHoursTab(win, L);

  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: [{ open: '18:00', close: '08:00' }], // close before open
  });
  await submitOverride(dialog, L);
  await win.waitForTimeout(500);

  expect(await pageCrashed(win)).toBe(false);
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.createSuccess)).toHaveCount(0);
  await expect(dialog.getByText(L.errCloseBeforeOpen)).toBeVisible();

  await win.screenshot({ path: `test-results/sou165-s2b-close-before-open-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — the planner grays out closed time AND the mid-day iftar gap for a
// date inside the override range; a date outside the range is unaffected.
// (The planner has no in-UI date navigation; it renders the current real week,
// so range membership is exercised by whether the override covers today.)
// ---------------------------------------------------------------------------
test('Scenario 3a — planner grays out closed time and the iftar gap inside the override range', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoHoursTab(win, L);
  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: IFTAR,
  });
  await submitOverride(dialog, L);
  await dialog.waitFor({ state: 'detached' });

  await gotoPlanner(win, L);
  // The axis reflects the override hours (extends to 23:00, no longer the 09:00 static start).
  await expect(win.getByText('23:00', { exact: true })).toBeVisible();
  await expect(win.getByText('09:00', { exact: true })).toHaveCount(0);
  // Closed days (Sunday + Tue..Sat) are grayed, and the Monday iftar gap is grayed.
  expect(await closedOverlays(win).count()).toBeGreaterThanOrEqual(6);
  await expect(iftarGapOverlay(win)).toHaveCount(1);

  await win.screenshot({ path: `test-results/sou165-s3a-planner-grayed-${locale()}.png` });
});

test('Scenario 3b — a date outside the override range is unaffected (static hours, no gray-out)', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoHoursTab(win, L);
  const dialog = await fillOverrideDialog(win, L, {
    start: OTHER_WEEK.start, // does NOT cover the current week
    end: OTHER_WEEK.end,
    weekday: MONDAY,
    windows: IFTAR,
  });
  await submitOverride(dialog, L);
  await dialog.waitFor({ state: 'detached' });

  await gotoPlanner(win, L);
  // Current week is outside the override → static default hours (09:00 start) and no gray-out.
  await expect(win.getByText('09:00', { exact: true })).toBeVisible();
  await expect(closedOverlays(win)).toHaveCount(0);
  await expect(iftarGapOverlay(win)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou165-s3b-planner-static-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — a session on a date+time that falls in the iftar gap is rejected
// / skipped and the admin is told (errors.outside-windows), NOT a silent
// success. 17:00–18:00 Monday is chosen because it is inside the static default
// hours (09:00–18:00) yet inside the override's iftar gap (17:00–21:00), so a
// pass here proves the override actually governs session validation.
// ---------------------------------------------------------------------------
test('Scenario 4 — a session inside the iftar gap is rejected with the override-specific error', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;
  await seedRoom(win);

  await gotoHoursTab(win, L);
  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: IFTAR,
  });
  await submitOverride(dialog, L);
  await dialog.waitFor({ state: 'detached' });

  await gotoPlanner(win, L);
  const created = await tryCreateSession(win, L, MONDAY, '17:00', '18:00');

  // Acceptance: the guard fires — the session is NOT created and the admin is told.
  expect(created).toBe(false);
  expect(await readWeek(win)).toHaveLength(0);
  await expect(win.getByText(L.errOutsideWindows)).toBeVisible();

  await win.screenshot({ path: `test-results/sou165-s4-gap-rejected-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — archiving an override removes it from the list and stops the
// planner gray-out (static hours resume).
// ---------------------------------------------------------------------------
test('Scenario 5 — archiving an override clears the list and the planner gray-out', async () => {
  const L = OV[locale()];
  live = await boot(locale());
  const win = live.win;

  await gotoHoursTab(win, L);
  const dialog = await fillOverrideDialog(win, L, {
    start: CURRENT_WEEK.start,
    end: CURRENT_WEEK.end,
    weekday: MONDAY,
    windows: IFTAR,
  });
  await submitOverride(dialog, L);
  await dialog.waitFor({ state: 'detached' });

  // Gray-out is in effect first.
  await gotoPlanner(win, L);
  expect(await closedOverlays(win).count()).toBeGreaterThan(0);

  // Archive from Settings → Hours.
  await gotoHoursTab(win, L);
  await win.getByRole('region', { name: L.regionTitle }).getByRole('button', { name: L.archiveAction }).click();
  const confirm = win.getByRole('dialog', { name: L.archiveTitle });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: L.archiveConfirm, exact: true }).click();

  await expect(win.getByText(L.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.archiveAction })).toHaveCount(0);

  // Gray-out stops; static hours resume.
  await gotoPlanner(win, L);
  await expect(win.getByText('09:00', { exact: true })).toBeVisible();
  await expect(closedOverlays(win)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou165-s5-archived-${locale()}.png` });
});

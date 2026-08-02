import { test, expect } from '@playwright/test';
import { STR, boot, createHoliday, gotoHolidays, holidayRow, type Launched, type Locale } from './holidays.fixtures';

/**
 * SOU-30 — Holidays management (Settings), black-box.
 *
 * Critical-only per SOU-142: kept scenarios are fixed-holiday create (the
 * canonical top-level flow) and lunar-holiday create — the latter guards the
 * explicit hard rule that lunar dates are entered manually with NO Hijri
 * computation (CLAUDE.md §5quater / "never compute a Hijri calendar"); a
 * regression here would mean someone "fixed" this by adding Hijri math.
 * Plan-gate availability, multi-day range rendering, year filtering,
 * validation, edit, archive/restore, empty states, RTL, and relaunch
 * persistence are lower blast-radius and better covered at the
 * unit/component level.
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 2 — create a FIXED (solar) holiday: it recurs every Gregorian year.
// Single day (start == end). Success toast + row with the "Solaire (fixe)"
// badge and the localized date.
// ---------------------------------------------------------------------------
test('Scenario 2 — create a fixed (solar) single-day holiday', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await createHoliday(win, L, {
    nameFr: 'Jour de l’An QA',
    nameAr: 'رأس السنة',
    kind: 'fixed',
    start: '2026-01-01',
    end: '2026-01-01',
  });
  await expect(win.getByText(L.toast.created)).toBeVisible();
  await win.screenshot({ path: `test-results/holidays-fixed-${locale()}.png` });

  const row = holidayRow(win, 'Jour de l’An QA');
  await expect(row).toBeVisible();
  await expect(row).toContainText(L.type.fixed);
});

// ---------------------------------------------------------------------------
// Scenario 3 — create a LUNAR holiday. The type hint must state that lunar
// dates are entered manually with NO Hijri computation (acceptance criterion).
// Row carries the "Lunaire (manuel)" badge.
// ---------------------------------------------------------------------------
test('Scenario 3 — create a lunar holiday; hint states no Hijri computation', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await win.getByRole('button', { name: L.newBtn }).click();
  const dialog = win.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await win.getByRole('option', { name: L.type.lunar }).click();
  // The "no Hijri calendar" promise is visible copy, not buried logic.
  await expect(dialog.getByText(L.hint.lunar)).toBeVisible();

  await dialog.locator('input[name="name.fr"]').fill('Aïd al-Fitr QA');
  await dialog.locator('input[name="name.ar"]').fill('عيد الفطر');
  await dialog.locator('input[name="startDate"]').fill('2026-03-20');
  await dialog.locator('input[name="endDate"]').fill('2026-03-21');
  await dialog.getByRole('button', { name: L.dialog.create }).click();

  await expect(win.getByText(L.toast.created)).toBeVisible();
  const row = holidayRow(win, 'Aïd al-Fitr QA');
  await expect(row).toBeVisible();
  await expect(row).toContainText(L.type.lunar);
});

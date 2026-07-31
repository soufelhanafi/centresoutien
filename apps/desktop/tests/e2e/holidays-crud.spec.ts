import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  createHoliday,
  freshUserDataDir,
  gotoHolidays,
  holidayRow,
  realActiveHolidayCount,
  launch,
  type Launched,
  type Locale,
} from './holidays.fixtures';

/**
 * SOU-30 — Holidays management (Settings), black-box.
 *
 * Every scenario runs under both the `fr` (LTR) and `ar` (RTL) Playwright
 * projects. Driven only through the running packaged app; no renderer/domain
 * source is read.
 *
 * Acceptance criteria under test:
 *  - Holiday supports `fixed` (solar, recurs each Gregorian year) and `lunar`
 *    (entered manually per year; no Hijri computation).
 *  - Bilingual FR/AR names.
 *  - Inclusive startDate/endDate range (single-day == start; multi-day vacances).
 *  - UI lives in Settings, gated behind `settings.holidays` — now available in
 *    the base Essentiel plan.
 *  - List filterable by year.
 *  - Archive / restore.
 *  - FR (LTR) + AR (RTL) rendering, empty states, and invalid input.
 *
 * Out of scope here (documented in the QA report):
 *  - Single-session-on-holiday rejection (SessionOnHolidayError): there is no
 *    session-creation UI or IPC in this build yet, so it is not reachable
 *    black-box.
 *  - Monthly invoicing being unaffected by holidays: billing is monthly and has
 *    no per-session surface to exercise here.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Archive an active holiday by name via its row menu + confirm dialog. */
async function archiveHoliday(win: Page, L: (typeof STR)[Locale], nameFr: string): Promise<void> {
  await holidayRow(win, nameFr).getByRole('button', { name: L.rowMenuAria }).click();
  await win.getByRole('menuitem', { name: L.menu.archive }).click();
  const confirm = win.getByRole('dialog');
  await expect(confirm.getByText(L.archiveConfirm.title)).toBeVisible();
  await confirm.getByRole('button', { name: L.archiveConfirm.confirm, exact: true }).click();
  // Successive archives emit identical toasts that can stack; `.first()` keeps
  // the "archived" confirmation assertion without a strict-mode violation.
  await expect(win.getByText(L.toast.archived).first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — the Holidays section renders in Settings under the ESSENTIEL
// plan (the SOU-30 plan-gate move), with heading, subtitle, new button, tabs,
// and the year filter. This is also the plan-gate assertion.
// ---------------------------------------------------------------------------
test('Scenario 1 — Holidays section is available in Settings on the Essentiel plan', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);
  await win.screenshot({ path: `test-results/holidays-section-${locale()}.png` });

  await expect(win.getByRole('heading', { name: L.sectionTitle })).toBeVisible();
  await expect(win.getByText(L.sectionSubtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.active })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.archived })).toBeVisible();
  await expect(win.getByRole('combobox', { name: L.yearAria })).toBeVisible();
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

// ---------------------------------------------------------------------------
// Scenario 4 — multi-day vacances: an inclusive start/end range renders as a
// range; a single-day holiday renders as one date (both in the same view).
// ---------------------------------------------------------------------------
test('Scenario 4 — multi-day range renders as a date range', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await createHoliday(win, L, {
    nameFr: 'Vacances Printemps QA',
    nameAr: 'عطلة الربيع',
    kind: 'fixed',
    start: '2026-04-06',
    end: '2026-04-19',
  });
  await expect(win.getByText(L.toast.created)).toBeVisible();

  const row = holidayRow(win, 'Vacances Printemps QA');
  await expect(row).toBeVisible();
  // A range shows two dates separated by an en dash "–"; a single day would not.
  await expect(row).toContainText('–');
  await expect(row).toContainText('2026');
  await win.screenshot({ path: `test-results/holidays-multiday-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — the list is filterable by year. A fixed holiday recurs across
// years (shown under any year), while a lunar holiday is year-specific.
// ---------------------------------------------------------------------------
test('Scenario 5 — year filter: fixed recurs across years, lunar is year-specific', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  // Self-provision (a fresh center starts empty): one FIXED holiday in 2026 that
  // must recur under any year, one LUNAR holiday anchored to 2026 (year-specific),
  // and one LUNAR holiday anchored to 2028. Successive creates emit identical
  // toasts that stack, so we gate each on the dialog closing (deterministic).
  await createHoliday(win, L, {
    nameFr: 'Fête Fixe QA',
    nameAr: 'عطلة ثابتة',
    kind: 'fixed',
    start: '2026-05-01',
    end: '2026-05-01',
  });
  await expect(win.getByRole('dialog')).toBeHidden();

  await createHoliday(win, L, {
    nameFr: 'Fête Lunaire 2026 QA',
    nameAr: 'عيد قمري ٢٠٢٦',
    kind: 'lunar',
    start: '2026-06-15',
    end: '2026-06-15',
  });
  await expect(win.getByRole('dialog')).toBeHidden();

  await createHoliday(win, L, {
    nameFr: 'Fête Lunaire 2028 QA',
    nameAr: 'عيد قمري ٢٠٢٨',
    kind: 'lunar',
    start: '2028-05-10',
    end: '2028-05-10',
  });
  await expect(win.getByRole('dialog')).toBeHidden();

  // The year selector now offers 2028.
  const yearSelect = win.getByRole('combobox', { name: L.yearAria });
  await yearSelect.click();
  await expect(win.getByRole('option', { name: '2028' })).toBeVisible();
  await win.getByRole('option', { name: '2028' }).click();
  await win.waitForTimeout(300);
  await win.screenshot({ path: `test-results/holidays-year-2028-${locale()}.png` });

  // Under 2028: the fixed holiday recurs and is shown; the 2028 lunar holiday is
  // shown; the 2026-only lunar holiday is hidden (lunar dates are year-specific).
  await expect(holidayRow(win, 'Fête Fixe QA')).toBeVisible();
  await expect(holidayRow(win, 'Fête Lunaire 2028 QA')).toBeVisible();
  await expect(holidayRow(win, 'Fête Lunaire 2026 QA')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 6 — invalid input. Empty submit is rejected (required + invalid
// date); an end date before the start date is rejected; the dialog stays open
// and nothing is created.
// ---------------------------------------------------------------------------
test('Scenario 6 — validation rejects empty fields and end-before-start', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await win.getByRole('button', { name: L.newBtn }).click();
  const dialog = win.getByRole('dialog');
  await dialog.getByRole('button', { name: L.dialog.create }).click();
  await expect(dialog.getByText(L.errors.required).first()).toBeVisible();
  await expect(dialog.getByText(L.errors.invalidDate).first()).toBeVisible();
  await expect(dialog).toBeVisible();

  // Now an inverted range.
  await dialog.locator('input[name="name.fr"]').fill('Invalide QA');
  await dialog.locator('input[name="name.ar"]').fill('غير صالح');
  await dialog.locator('input[name="startDate"]').fill('2026-06-10');
  await dialog.locator('input[name="endDate"]').fill('2026-06-05');
  await dialog.getByRole('button', { name: L.dialog.create }).click();
  await expect(dialog.getByText(L.errors.endBeforeStart)).toBeVisible();
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: `test-results/holidays-validation-${locale()}.png` });

  // Nothing was created.
  await win.keyboard.press('Escape');
  await expect(holidayRow(win, 'Invalide QA')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 7 — edit a holiday's name; the list reflects the change.
// ---------------------------------------------------------------------------
test('Scenario 7 — edit a holiday name', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await createHoliday(win, L, {
    nameFr: 'Avant QA',
    nameAr: 'قبل',
    kind: 'fixed',
    start: '2026-05-01',
    end: '2026-05-01',
  });
  await expect(win.getByText(L.toast.created)).toBeVisible();

  await holidayRow(win, 'Avant QA').getByRole('button', { name: L.rowMenuAria }).click();
  await win.getByRole('menuitem', { name: L.menu.edit }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.dialog.editTitle })).toBeVisible();
  await dialog.locator('input[name="name.fr"]').fill('Après QA');
  await dialog.getByRole('button', { name: L.dialog.save }).click();

  await expect(win.getByText(L.toast.edited)).toBeVisible();
  await expect(holidayRow(win, 'Après QA')).toBeVisible();
  await expect(holidayRow(win, 'Avant QA')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 8 — archive then restore. Archived leaves the active list and lands
// in the archived tab; restore returns it to the active list.
// ---------------------------------------------------------------------------
test('Scenario 8 — archive then restore a holiday', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  await createHoliday(win, L, {
    nameFr: 'À Archiver QA',
    nameAr: 'للأرشفة',
    kind: 'fixed',
    start: '2026-07-14',
    end: '2026-07-14',
  });
  await expect(win.getByText(L.toast.created)).toBeVisible();

  await archiveHoliday(win, L, 'À Archiver QA');
  // Gone from active.
  await expect(holidayRow(win, 'À Archiver QA')).toHaveCount(0);

  // Present in the archived tab with a restore action.
  await win.getByRole('tab', { name: L.tabs.archived }).click();
  const archivedRow = holidayRow(win, 'À Archiver QA');
  await expect(archivedRow).toBeVisible();
  await win.screenshot({ path: `test-results/holidays-archived-${locale()}.png` });
  await archivedRow.getByRole('button', { name: L.restoreBtn }).click();
  await expect(win.getByText(L.toast.restored)).toBeVisible();

  // Back in the active list.
  await win.getByRole('tab', { name: L.tabs.active }).click();
  await expect(holidayRow(win, 'À Archiver QA')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 9 — empty states for both tabs. Self-provision two holidays, then
// archive both to prove the active-list empty state; the archived tab's empty
// state shows before anything is archived.
// ---------------------------------------------------------------------------
test('Scenario 9 — empty states for active and archived lists', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  // Self-provision (a fresh center starts empty): a fixed + a lunar holiday.
  // Successive creates emit identical toasts that stack, so gate each on the
  // dialog closing (deterministic) rather than the transient toast.
  await createHoliday(win, L, {
    nameFr: 'Vide Fixe QA',
    nameAr: 'فارغ ثابت',
    kind: 'fixed',
    start: '2026-11-06',
    end: '2026-11-06',
  });
  await expect(win.getByRole('dialog')).toBeHidden();
  await createHoliday(win, L, {
    nameFr: 'Vide Lunaire QA',
    nameAr: 'فارغ قمري',
    kind: 'lunar',
    start: '2026-12-01',
    end: '2026-12-01',
  });
  await expect(win.getByRole('dialog')).toBeHidden();

  // Archived tab empty state (nothing archived yet).
  await win.getByRole('tab', { name: L.tabs.archived }).click();
  await expect(win.getByText(L.archivedEmpty.title)).toBeVisible();
  await expect(win.getByText(L.archivedEmpty.subtitle)).toBeVisible();

  // Empty the active list by archiving both holidays this test created, then
  // assert its empty state.
  await win.getByRole('tab', { name: L.tabs.active }).click();
  await archiveHoliday(win, L, 'Vide Lunaire QA');
  await archiveHoliday(win, L, 'Vide Fixe QA');
  await expect(win.getByText(L.activeEmpty.title)).toBeVisible();
  await expect(win.getByText(L.activeEmpty.subtitle)).toBeVisible();
  await win.screenshot({ path: `test-results/holidays-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 10 — locale direction and RTL mirroring: <html dir/lang> match the
// locale, copy is localized, and the "new" button sits on the mirrored side of
// the section heading.
// ---------------------------------------------------------------------------
test('Scenario 10 — locale direction and RTL mirroring', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoHolidays(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  const heading = win.getByRole('heading', { name: L.sectionTitle });
  const newBtn = win.getByRole('button', { name: L.newBtn });
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    // RTL: the action sits to the LEFT of the heading.
    expect(bBox.x).toBeLessThan(hBox.x);
  } else {
    expect(bBox.x).toBeGreaterThan(hBox.x);
  }
  await win.screenshot({ path: `test-results/holidays-direction-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 11 — persistence across relaunch (a real center owner expects the
// holidays they add to still be there tomorrow). Create a holiday, relaunch the
// SAME user-data dir, and expect it to survive. This also cross-checks the real
// SQLite-backed `holiday.list` IPC.
// ---------------------------------------------------------------------------
test('Scenario 11 — a created holiday persists across an app relaunch', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();
  live = await boot(locale(), dir);
  let win = live.win;
  await gotoHolidays(win, L);

  await createHoliday(win, L, {
    nameFr: 'Persistante QA',
    nameAr: 'دائمة',
    kind: 'fixed',
    start: '2026-08-14',
    end: '2026-08-14',
  });
  await expect(win.getByText(L.toast.created)).toBeVisible();
  await expect(holidayRow(win, 'Persistante QA')).toBeVisible();

  // Cross-check: the created holiday should also be visible to the real
  // (SQLite-backed) holiday IPC. If this is 0, the screen is rendering from an
  // in-memory sample source rather than the persisted store.
  const inRealStore = await realActiveHolidayCount(win);

  await live.app.close();

  // Relaunch the SAME user-data dir. The admin + remembered-device session were
  // persisted on the first run, so the shell renders without re-seeding (same
  // recipe as the SOU-29 hours relaunch scenario). A real owner expects the
  // holidays they added yesterday to still be here.
  live = await launch(locale(), 'essentiel', dir);
  win = live.win;
  await gotoHolidays(win, L);

  await expect(
    holidayRow(win, 'Persistante QA'),
    `holiday added before relaunch is still listed (real holiday.list count right after create: ${inRealStore})`,
  ).toBeVisible();
});

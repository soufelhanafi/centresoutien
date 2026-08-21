import { test, expect } from '@playwright/test';
import {
  STR,
  WINDOW,
  launch,
  gotoPlanner,
  seedTemplates,
  generateOccurrences,
  tryRegenerate,
  readTemplateCount,
  parseDeletedCount,
  performResetViaUi,
  pageCrashed,
  type Launched,
  type Locale,
} from './planning-reset.fixtures';

/**
 * SOU-295 — planner "réinitialiser le planning" danger zone. Black-box, driven
 * only through the running packaged app + the public preload bridge. Runs under
 * both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * The real `planning.reset` IPC is wired on this branch, so these specs assert
 * PERSISTED outcomes — the future planning is globally wiped, the recurrence stops
 * (templates tombstoned, `session.week` empties), past-dated occurrences survive
 * (they feed payroll), regeneration never resurrects the wiped planning, and the
 * success toast reports the REAL deleted count — not just UI copy.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const dialog = (win: Launched['win']) => win.getByRole('dialog');

test('typed confirmation + cutoff choice gate the destructive reset', async () => {
  const L = STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await gotoPlanner(win, L);
  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);

  await win.getByRole('button', { name: L.resetTrigger }).click();
  const d = dialog(win);
  await expect(d.getByRole('heading', { name: L.dialogTitle })).toBeVisible();

  // The danger-zone warning is shown up front.
  await expect(d.getByText(L.warning, { exact: false })).toBeVisible();

  // Both cutoff options are offered and independently selectable (AC3), and the
  // hint tells the director which date will be the deletion floor.
  const today = d.getByRole('radio', { name: L.cutoffToday });
  const tomorrow = d.getByRole('radio', { name: L.cutoffTomorrow });
  await expect(d.getByText(L.cutoffLegend, { exact: false })).toBeVisible();
  await today.click();
  await expect(today).toBeChecked();
  await expect(d.getByText(L.cutoffHintPrefix, { exact: false })).toBeVisible();
  await tomorrow.click();
  await expect(tomorrow).toBeChecked();
  await expect(today).not.toBeChecked();

  // The confirm button stays disabled until the confirmation word is typed (AC2):
  // a non-matching value never arms it.
  const confirm = d.getByRole('button', { name: L.confirmButton, exact: true });
  await expect(confirm).toBeDisabled();
  const input = d.getByRole('textbox');
  await input.fill('nope');
  await expect(confirm).toBeDisabled();
  // The gate is intentionally case-insensitive (trim + toLocaleUpperCase, unit-tested),
  // so the same word in lowercase still arms it (FR only — Arabic is caseless).
  if (L.confirmWord.toLowerCase() !== L.confirmWord) {
    await input.fill(L.confirmWord.toLowerCase());
    await expect(confirm).toBeEnabled();
  }
  await input.fill(L.confirmWord);
  await expect(confirm).toBeEnabled();

  expect(await pageCrashed(win)).toBe(false);
});

test('reset globally wipes future planning, stops recurrence, and keeps past sessions', async () => {
  const L = STR[locale()];
  live = await launch(locale());
  const win = live.win;

  // Two templates on distinct weekdays (a real global center wide setup).
  const { templates } = await seedTemplates(win, [
    { dayOfWeek: 1, start: '15:00', end: '17:00' },
    { dayOfWeek: 3, start: '15:00', end: '17:00' },
  ]);
  const [monday, wednesday] = templates;
  expect(monday && wednesday).toBeTruthy();

  // 3 FUTURE occurrences (2 Mondays + 1 Wednesday) and 1 PAST occurrence (Monday).
  await generateOccurrences(win, [
    { recurringSessionId: monday!.id, ...WINDOW.futureTwoWeeks },
    { recurringSessionId: wednesday!.id, ...WINDOW.futureWeek },
    { recurringSessionId: monday!.id, ...WINDOW.pastWeek },
  ]);

  await gotoPlanner(win, L);
  expect(await readTemplateCount(win)).toBe(2);

  const toastText = await performResetViaUi(win, L, 'today');

  // Real deletion count: exactly the 3 FUTURE séances. A 4 would mean the past
  // occurrence was wrongly wiped; a 0 would be the old mock gateway — both fail.
  expect(parseDeletedCount(toastText)).toBe(3);

  // Recurrence stopped: EVERY template tombstoned (global wipe, both weekdays).
  expect(await readTemplateCount(win)).toBe(0);
  await expect(win.getByText(L.emptyWeek, { exact: false })).toBeVisible();

  // No working undo affordance exists (AC6 — undo is out of scope).
  await expect(win.getByRole('button', { name: /annuler la réinitialisation|rétablir|undo|تراجع|استرجاع/i })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou295-reset-wiped-${locale()}.png` });
});

test('regeneration after a reset does not resurrect the wiped planning', async () => {
  const L = STR[locale()];
  live = await launch(locale());
  const win = live.win;

  const { templates } = await seedTemplates(win, [{ dayOfWeek: 1, start: '15:00', end: '17:00' }]);
  const monday = templates[0];
  expect(monday).toBeTruthy();
  await generateOccurrences(win, [{ recurringSessionId: monday!.id, ...WINDOW.futureTwoWeeks }]);

  await gotoPlanner(win, L);
  expect(await readTemplateCount(win)).toBe(1);

  expect(parseDeletedCount(await performResetViaUi(win, L, 'today'))).toBe(2);
  expect(await readTemplateCount(win)).toBe(0);

  // Try to re-materialize the SAME (now tombstoned) template. It must not bring
  // the recurrence back...
  await tryRegenerate(win, [{ recurringSessionId: monday!.id, ...WINDOW.futureTwoWeeks }]);
  expect(await readTemplateCount(win)).toBe(0);

  // ...and it must not resurrect the occurrences: a second reset finds nothing
  // future left to delete (N === 0). Had the two occurrences reappeared, N would
  // be 2.
  expect(parseDeletedCount(await performResetViaUi(win, L, 'today'))).toBe(0);

  expect(await pageCrashed(win)).toBe(false);
});

test('the danger zone is gated by core.calendar.week (no trigger when the flag is off)', async () => {
  const L = STR[locale()];
  live = await launch(locale(), { omitFeatures: ['core.calendar.week'] });
  const win = live.win;

  await gotoPlanner(win, L);
  await expect(win.getByRole('button', { name: L.resetTrigger })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
});

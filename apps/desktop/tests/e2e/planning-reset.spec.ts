import { test, expect } from '@playwright/test';
import {
  STR,
  launch,
  gotoPlanner,
  pageCrashed,
  type Launched,
  type Locale,
} from './planning-reset.fixtures';

/**
 * SOU-295 — planner "réinitialiser le planning" danger zone. Black-box, driven
 * only through the running packaged app + the public preload bridge. Runs under
 * both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * The reset runs against the interim mock gateway until the domain agent's
 * `planning.reset` handler merges, so the assertions cover the UI contract — the
 * destructive trigger, the typed-confirmation gate, the cutoff choice, and the
 * success toast — not a persisted deletion count.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const dialog = (win: Launched['win']) => win.getByRole('dialog');

test('typed confirmation gates the destructive reset, then a success toast confirms it', async () => {
  const L = STR[locale()];
  live = await launch(locale());
  const win = live.win;

  await gotoPlanner(win, L);
  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);

  await win.getByRole('button', { name: L.resetTrigger }).click();
  await expect(dialog(win).getByRole('heading', { name: L.dialogTitle })).toBeVisible();

  // The confirm button is disabled until the exact word is typed.
  const confirm = dialog(win).getByRole('button', { name: L.confirmButton, exact: true });
  await expect(confirm).toBeDisabled();

  // Choosing a cutoff never arms the button on its own.
  await dialog(win).getByRole('radio', { name: L.cutoffToday }).click();
  await expect(confirm).toBeDisabled();

  // A wrong word keeps it locked; the exact word arms it.
  const input = dialog(win).getByRole('textbox');
  await input.fill('nope');
  await expect(confirm).toBeDisabled();
  await input.fill(L.confirmWord);
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(win.getByText(L.successPrefix, { exact: false })).toBeVisible();

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou295-reset-${locale()}.png` });
});

test('the danger zone is gated by core.calendar.week (no trigger when the flag is off)', async () => {
  const L = STR[locale()];
  live = await launch(locale(), { omitFeatures: ['core.calendar.week'] });
  const win = live.win;

  await gotoPlanner(win, L);
  await expect(win.getByRole('button', { name: L.resetTrigger })).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
});

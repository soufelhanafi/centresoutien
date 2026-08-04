import { test, expect } from '@playwright/test';
import { boot, gotoPlanning, STR, type Launched, type Locale } from './planning-sessions.fixtures';
import { GENERATOR_STR } from './session-generator.fixtures';

/**
 * SOU-159 — AC1: the "Générer des séances" toolbar entry is plan-gated
 * behind `planning.custom-grid` (Pro) / `planning.random-auto` (Premium).
 * Essentiel has neither flag, so the button must not render at all.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('Essentiel plan — no generator button on the planner toolbar', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] }, 'essentiel');
  const win = live.win;
  await gotoPlanning(win, L);

  await expect(win.getByRole('button', { name: GENERATOR_STR[locale()].trigger, exact: true })).toHaveCount(0);
});

for (const plan of ['pro', 'premium'] as const) {
  test(`${plan} plan — generator button is visible on the planner toolbar`, async () => {
    const L = STR[locale()];
    live = await boot(locale(), { rooms: [{ name: 'Salle A' }] }, plan);
    const win = live.win;
    await gotoPlanning(win, L);

    await expect(win.getByRole('button', { name: GENERATOR_STR[locale()].trigger, exact: true })).toBeVisible();
  });
}

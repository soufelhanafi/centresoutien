import { test, expect } from '@playwright/test';
import { boot, gotoPlanning, STR, type Launched, type Locale } from './planning-sessions.fixtures';
import { GENERATOR_STR } from './session-generator.fixtures';

/**
 * SOU-159 — AC1: the "Générer des séances" toolbar entry is gated behind
 * `planning.custom-grid` / `planning.random-auto`. Per the SOU-83 MVP tier
 * collapse every tier grants those flags, so the button renders on all plans.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

for (const plan of ['essentiel', 'pro', 'premium'] as const) {
  test(`${plan} plan — generator button is visible on the planner toolbar`, async () => {
    const L = STR[locale()];
    live = await boot(locale(), { rooms: [{ name: 'Salle A' }] }, plan);
    const win = live.win;
    await gotoPlanning(win, L);

    await expect(win.getByRole('button', { name: GENERATOR_STR[locale()].trigger, exact: true })).toBeVisible();
  });
}

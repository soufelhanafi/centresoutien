import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  ALL_MODULES,
  PRO_GATED,
  PREMIUM_GATED,
  unlockedFor,
  boot,
  activePlan,
  type Launched,
  type Locale,
  type PlanId,
} from './app-shell.fixtures';

/**
 * SOU-99 — App shell: sidebar navigation, FR/AR + RTL, plan-gated entries,
 * collapse/expand, keyboard navigation. Black-box, driven through the running
 * packaged app only. Each spec runs under both the `fr` and `ar` Playwright
 * projects, giving LTR + RTL coverage of every scenario.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Wait for the shell nav to be mounted. */
async function waitForShell(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('navigation', { name: L.navAria })).toBeVisible();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — every module entry renders with its localized label (premium =
// all unlocked), in the project's locale.
// ---------------------------------------------------------------------------
test('Scenario 1 — all 12 module entries render with localized labels', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);

  const nav = win.getByRole('navigation', { name: L.navAria });
  for (const key of ALL_MODULES) {
    await expect(nav.getByRole('link', { name: L.nav[key], exact: true })).toBeVisible();
  }
  // Exactly 12 module links, no locked buttons on premium.
  await expect(nav.getByRole('link')).toHaveCount(12);
  await expect(win.locator('nav button[aria-disabled="true"]')).toHaveCount(0);

  await win.screenshot({ path: `test-results/shell-nav-premium-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — active-route highlighting follows navigation.
// ---------------------------------------------------------------------------
test('Scenario 2 — active-route highlight moves when navigating', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);
  const nav = win.getByRole('navigation', { name: L.navAria });

  // Boots on /dashboard → dashboard entry is the current page.
  await expect(nav.getByRole('link', { name: L.nav.dashboard, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Navigate to Élèves → it becomes current, dashboard is no longer current.
  await nav.getByRole('link', { name: L.nav.students, exact: true }).click();
  await expect(nav.getByRole('link', { name: L.nav.students, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: L.nav.dashboard, exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );

  // And again to Paramètres.
  await nav.getByRole('link', { name: L.nav.settings, exact: true }).click();
  await expect(nav.getByRole('link', { name: L.nav.settings, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: L.nav.students, exact: true })).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

// ---------------------------------------------------------------------------
// Scenario 3 — collapse / expand.
// ---------------------------------------------------------------------------
test('Scenario 3 — sidebar collapses and expands', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);
  const nav = win.getByRole('navigation', { name: L.navAria });

  const expandedWidth = (await nav.boundingBox())!.width;
  expect(expandedWidth).toBeGreaterThan(200);
  // Label text is visible while expanded.
  await expect(nav.getByText(L.nav.students, { exact: true })).toBeVisible();

  await win.getByRole('button', { name: L.collapse }).click();
  await expect
    .poll(async () => (await nav.boundingBox())!.width)
    .toBeLessThan(expandedWidth - 100);
  // The toggle now offers "expand".
  await expect(win.getByRole('button', { name: L.expand })).toBeVisible();

  // Expand again restores the width.
  await win.getByRole('button', { name: L.expand }).click();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(expandedWidth - 10);
  await win.screenshot({ path: `test-results/shell-collapsed-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 — locale direction + RTL sidebar mirroring.
// ---------------------------------------------------------------------------
test('Scenario 4 — direction matches locale and the sidebar mirrors in RTL', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  const nav = win.getByRole('navigation', { name: L.navAria });
  const box = (await nav.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  if (locale() === 'ar') {
    // RTL → sidebar pinned to the RIGHT edge.
    expect(box.x + box.width).toBeGreaterThan(vw - 2);
    expect(box.x).toBeGreaterThan(vw / 2);
  } else {
    // LTR → sidebar pinned to the LEFT edge.
    expect(box.x).toBeLessThan(2);
  }
  await win.screenshot({ path: `test-results/shell-direction-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — plan gating reflects the registry, per plan.
// ---------------------------------------------------------------------------
for (const plan of ['essentiel', 'pro', 'premium'] as const satisfies readonly PlanId[]) {
  test(`Scenario 5 — plan gating on ${plan}`, async () => {
    const L = STR[locale()];
    live = await boot(locale(), plan);
    const win = live.win;
    await waitForShell(win, L);
    expect(await activePlan(win)).toBe(plan);

    const nav = win.getByRole('navigation', { name: L.navAria });
    const unlocked = unlockedFor(plan);

    for (const key of ALL_MODULES) {
      const label = L.nav[key];
      const asLink = nav.getByRole('link', { name: label, exact: true });
      if (unlocked.has(key)) {
        await expect(asLink, `${key} should be an active link on ${plan}`).toHaveCount(1);
      } else {
        // Locked: NOT a link; a disabled button carrying the label + upgrade title.
        await expect(asLink, `${key} should NOT be a link on ${plan}`).toHaveCount(0);
        const lockedBtn = nav.getByRole('button').filter({ hasText: label });
        await expect(lockedBtn, `${key} locked button on ${plan}`).toHaveCount(1);
        await expect(lockedBtn).toHaveAttribute('aria-disabled', 'true');
        await expect(lockedBtn).toHaveAttribute('title', L.lockedTitle);
      }
    }

    // Count the locked buttons matches the registry expectation.
    const expectedLocked =
      plan === 'essentiel' ? PRO_GATED.length + PREMIUM_GATED.length : plan === 'pro' ? PREMIUM_GATED.length : 0;
    await expect(win.locator('nav button[aria-disabled="true"]')).toHaveCount(expectedLocked);

    await win.screenshot({ path: `test-results/shell-gating-${plan}-${locale()}.png` });
  });
}

// ---------------------------------------------------------------------------
// Scenario 6 — a locked entry shows an upgrade affordance and never navigates.
// ---------------------------------------------------------------------------
test('Scenario 6 — locked entry is inert (no navigation) and shows the upgrade affordance', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  await waitForShell(win, L);
  const nav = win.getByRole('navigation', { name: L.navAria });

  const payroll = nav.getByRole('button').filter({ hasText: L.nav.payroll });
  await expect(payroll).toHaveAttribute('aria-disabled', 'true');
  await expect(payroll).toHaveAttribute('title', L.lockedTitle);
  // Plan badge present (PRO for a Pro-gated entry).
  await expect(payroll.getByText('PRO', { exact: true })).toBeVisible();

  const hashBefore = await win.evaluate(() => location.hash);
  await payroll.click({ force: true });
  // Still on the dashboard route; the disabled entry did not navigate.
  expect(await win.evaluate(() => location.hash)).toBe(hashBefore);
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardHeading })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 7 — keyboard navigation: tab reaches nav entries with a visible
// focus ring, and Enter activates the focused entry.
// ---------------------------------------------------------------------------
test('Scenario 7 — nav is keyboard reachable, focus is visible, Enter activates', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);

  const activeText = () =>
    win.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  const activeIsFocusVisible = () =>
    win.evaluate(() => !!document.activeElement?.matches(':focus-visible'));

  // Tab from the top until focus lands on the Students entry (proves the nav
  // entries are in the keyboard tab order and reachable).
  let reached = false;
  for (let i = 0; i < 20; i++) {
    await win.keyboard.press('Tab');
    if ((await activeText()) === L.nav.students) {
      reached = true;
      break;
    }
  }
  expect(reached, 'Students entry reachable by Tab').toBe(true);

  // Keyboard focus shows the visible focus ring (:focus-visible matches).
  expect(await activeIsFocusVisible()).toBe(true);

  // Activate with the keyboard → the Students route becomes current.
  await win.keyboard.press('Enter');
  const nav = win.getByRole('navigation', { name: L.navAria });
  await expect(nav.getByRole('link', { name: L.nav.students, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

// ---------------------------------------------------------------------------
// Scenario 8 — header: center name + language switcher; toggling language flips
// direction live without a relaunch.
// ---------------------------------------------------------------------------
test('Scenario 8 — header shows center name and the language switcher flips direction live', async () => {
  const L = STR[locale()];
  const other: Locale = locale() === 'fr' ? 'ar' : 'fr';
  live = await boot(locale(), 'premium');
  const win = live.win;
  await waitForShell(win, L);

  const header = win.locator('header').first();
  await expect(header).toContainText(L.currentCenter);
  await expect(win.getByRole('button', { name: L.logout })).toBeVisible();

  // Toggle language → direction + labels switch live.
  await win.getByRole('button', { name: L.otherLang }).click();
  await expect(win.getByRole('heading', { level: 1, name: STR[other].dashboardHeading })).toBeVisible();
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[other]);
  await expect(
    win.getByRole('navigation', { name: STR[other].navAria }).getByRole('link', {
      name: STR[other].nav.students,
      exact: true,
    }),
  ).toBeVisible();
});

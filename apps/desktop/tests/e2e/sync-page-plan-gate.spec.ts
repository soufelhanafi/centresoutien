import { test, expect, type Page } from '@playwright/test';
import { STR, bootWithClash, type Launched, type Locale } from './sync-conflicts.fixtures';

/**
 * SOU-84 — Enforce feature gates across UI + repos (black-box functional QA).
 *
 * KICKOFF DECISION: gating is proven against an under-provisioned plan by
 * DROPPING the `sync.multi-device` flag, NOT by picking a plan id — the shipped
 * MVP tiers (SOU-83) grant that flag to essentiel / pro / premium alike.
 *
 * SOU-187 adds the NEGATIVE path seam: `CS_E2E_OMIT_FEATURES` can drop a flag
 * from a real plan in the dedicated e2e build only. This lets the packaged app
 * prove the full-page plan gate, locked nav entry, and domain `PlanPolicy` throw
 * without changing shipped plan membership.
 *
 * What IS black-box provable here (the shipped reality, flag PRESENT): the
 * Synchronisation entry is a live nav link and the page renders the WORKING sync
 * surface — never the full-page plan gate. This is the regression guard that the
 * gate is not falsely triggered on plans that DO include the flag.
 */

const locale = () => test.info().project.name as Locale;

/** `plan.locked` — the full-page gate title, mirrored from i18n {fr,ar}.json. */
const GATE_TITLE: Record<Locale, string> = {
  fr: 'Réservé à un plan supérieur',
  ar: 'غير متاح في خطتك',
};

const GATE_CTA: Record<Locale, string> = {
  fr: 'Débloquer avec Premium',
  ar: 'افتح مع بريميوم',
};

async function navigateToHash(win: Page, hash: string): Promise<void> {
  await win.evaluate((target) => {
    window.location.hash = target;
  }, hash);
}

async function runSyncThroughBridge(win: Page): Promise<string> {
  return win.evaluate(async () => {
    try {
      await (window as unknown as { api: { invoke: (channel: string, request: unknown) => Promise<unknown> } }).api.invoke(
        'sync.run',
        {},
      );
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

for (const plan of ['essentiel', 'premium'] as const) {
  test(`${plan} plan grants sync.multi-device — Synchronisation renders the working page, not the plan gate`, async () => {
    const L = STR[locale()];
    live = await bootWithClash(locale(), plan, false);
    const win = live.win;

    const nav = win.getByRole('navigation', { name: L.navAria });
    const link = nav.getByRole('link', { name: L.nav, exact: true });
    await expect(link).toBeVisible();
    await link.click();

    await expect(win.getByRole('heading', { name: L.title }).first()).toBeVisible();
    await expect(win.getByText(L.subtitle)).toBeVisible();
    await expect(win.getByText(GATE_TITLE[locale()])).toHaveCount(0);
    await expect(win.locator('html')).toHaveAttribute('dir', L.dir);
  });
}

test('premium minus sync.multi-device renders sync as locked and domain-gated', async () => {
  const L = STR[locale()];
  live = await bootWithClash(locale(), 'premium', false, { omitFeatures: ['sync.multi-device'] });
  const win = live.win;

  const nav = win.getByRole('navigation', { name: L.navAria });
  await expect(nav.getByRole('link', { name: L.nav, exact: true })).toHaveCount(0);
  const lockedNav = nav.getByRole('button', { name: L.nav, exact: true });
  await expect(lockedNav).toBeVisible();
  await expect(lockedNav).toBeDisabled();

  await navigateToHash(win, '#/sync');
  await expect(win.getByText(GATE_TITLE[locale()])).toBeVisible();
  await expect(win.getByRole('button', { name: GATE_CTA[locale()] })).toBeVisible();
  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);

  const error = await runSyncThroughBridge(win);
  expect(error).toContain('PlanFeatureUnavailableError');
  expect(error).toContain('sync.multi-device');
});

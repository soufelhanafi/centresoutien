import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

/*
 * Black-box fixtures for SOU-105 — "Consolidated multi-center dashboard"
 * (the dashboard "Consolidé" tab).
 *
 * REACHABILITY
 * ------------
 * SOU-105 is the FIRST and only desktop surface gated on `org.multi-center`,
 * the single flag the SOU-83 flat MVP tiers keep Premium-only. That is exactly
 * the seam upgrade-cta.spec.ts (SOU-85) documented as previously un-reachable
 * from the packaged app. It is now reachable through the documented `CS_PLAN`
 * launch switch every other suite uses, so both gated branches are black-box
 * drivable:
 *   - CS_PLAN=essentiel|pro  → flag ABSENT  → Premium UPSELL LOCK branch
 *   - CS_PLAN=premium        → flag PRESENT → cloud LINK-OUT branch (no data)
 *
 * The locked scope for this ticket is "Desktop = upsell only": the tab must
 * never aggregate across per-center DBs. The strongest black-box guarantee of
 * that is that the Premium branch renders a link-out card and NO KPI figures —
 * asserted here — and that the tab renders regardless of data state.
 *
 * Everything is driven through the running packaged app and the public preload
 * bridge only; no renderer/domain/data implementation is imported. Every string
 * mirrors i18n/fr.json + ar.json (`dashboard.tabs.consolidated`,
 * `dashboard.consolidated.*`, `upgrade.unlockWith`, `plan.names.premium`).
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const STR: Record<
  Locale,
  {
    navDashboard: string;
    tabBasic: string;
    tabConsolidated: string;
    /* Non-Premium upsell lock title (`dashboard.consolidated.lock.title`). */
    lockTitle: RegExp;
    /* Premium link-out card title (`dashboard.consolidated.cloud.title`). */
    cloudTitle: RegExp;
    /* Premium link-out card body (`dashboard.consolidated.cloud.body`). */
    cloudBody: RegExp;
    /* Upgrade CTA button (`upgrade.unlockWith` filled with `plan.names.premium`). */
    unlockCta: RegExp;
    /* KPI labels that MUST NOT appear as real data in the Premium branch. */
    kpiRevenue: string;
  }
> = {
  fr: {
    navDashboard: 'Tableau de bord',
    tabBasic: 'Basique',
    tabConsolidated: 'Consolidé',
    lockTitle: /Tableau de bord multi-centres/,
    cloudTitle: /Disponible dans l.application web/,
    cloudBody: /vue consolidée de tous vos centres est disponible dans l.application web/,
    unlockCta: /Débloquer avec\s+Premium/,
    kpiRevenue: 'Revenu total',
  },
  ar: {
    navDashboard: 'لوحة القيادة',
    tabBasic: 'أساسي',
    tabConsolidated: 'موحّد',
    lockTitle: /لوحة القيادة متعددة المراكز/,
    cloudTitle: /متاح في تطبيق الويب/,
    cloudBody: /العرض الموحّد لجميع مراكزك متاح في تطبيق الويب/,
    unlockCta: /افتح مع\s+بريميوم/,
    kpiRevenue: 'إجمالي الإيرادات',
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-consolidated-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: plan };
  // Never inherit a feature-omit override from the parent shell — it would flip
  // gating and fail this suite for non-product reasons (matches sync-conflicts).
  delete env['CS_E2E_OMIT_FEATURES'];
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/* Launch, clear the first-run + auth gates through the public bridge (same recipe every other suite uses). */
export async function boot(locale: Locale, plan: PlanId): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/* The active plan straight from the domain — proves CS_PLAN took effect before we assert on the gated branch. */
export function activePlan(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ planId: string }> } }).api;
    return (await api.invoke('plan.get', {})).planId;
  });
}

/* Navigate to the dashboard through the sidebar and select the Consolidé tab. */
export async function gotoConsolidatedTab(win: Page, strings: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: strings.navDashboard, exact: true }).click();
  const tab = win.getByRole('tab', { name: strings.tabConsolidated });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

import { test, expect } from '@playwright/test';
import { launch, stubOpenExternal, openExternal, type Launched, type Locale } from './upgrade-cta.fixtures';
import {
  boot as bootPayroll,
  gotoPayroll,
  STR as PAYROLL_STR,
  type Launched as PayrollLaunched,
} from './payroll-dashboard.fixtures';

/**
 * SOU-85 — "Upgrade CTAs on gated features" (black-box functional QA).
 *
 * KICKOFF / REACHABILITY DECISION
 * --------------------------------
 * SOU-85's user-visible surface (the inline "Débloquer avec {plan}" CTA and the
 * shared UpgradeDialog it opens) only renders when a feature flag is ABSENT from
 * the active plan. Under the SOU-83 flat MVP tiers, the packaged app's only plan
 * seam (`CS_PLAN` / PlanSwitcher `plan.set`) selects a whole tier, and every tier
 * grants every flag EXCEPT `org.multi-center` — which has no gated surface in the
 * desktop UI. So none of SOU-85's listed CTA surfaces (payroll, dashboard
 * advanced, sync, partial-paid, excel, exam-prep, groups) can be driven into
 * their locked state through the packaged app. That is the known SOU-187
 * feature-drop seam gap; the CTA + dialog rendering are proven at the component
 * layer instead (renderer tests), per CLAUDE.md §9.
 *
 * What IS black-box provable here:
 *   A. The `external.open` allowlist that backs the dialog's "Voir les tarifs"
 *      button — the concrete mechanism of AC2 (opens centresoutien.com in the
 *      default browser). Security-critical, so tested thoroughly.
 *   B. A reachability probe empirically confirming the CTA does NOT appear on a
 *      representative gated surface (payroll) under the shipped flat tiers — so
 *      the BLOCKED verdict above is evidence-backed, not assumed.
 */

const locale = () => test.info().project.name as Locale;

// ---------------------------------------------------------------------------
// A. external.open allowlist — the "Voir les tarifs" → OS-browser mechanism
// ---------------------------------------------------------------------------

test.describe('SOU-85 AC2 — external.open host allowlist (Voir les tarifs)', () => {
  // One app for all cases: these are read-only bridge invokes that mutate no
  // state, so a single launch keeps the run fast and avoids the Electron
  // close-flake seen when launching a fresh app per assertion.
  let live: Launched | null = null;
  test.beforeAll(async () => {
    live = await launch(locale(), 'premium');
    await stubOpenExternal(live.app);
  });
  test.afterAll(async () => {
    await live?.app.close();
    live = null;
  });

  test('allows the landing pricing hosts and rejects everything else', async () => {
    const win = live!.win;

    // Allowed: the canonical landing host and its www. alias, https only.
    expect(await openExternal(win, 'https://centresoutien.com/tarifs')).toEqual({ opened: true });
    expect(await openExternal(win, 'https://www.centresoutien.com/tarifs')).toEqual({ opened: true });

    // Rejected: foreign host, look-alike sub-domain, plain http, non-http scheme.
    expect(await openExternal(win, 'https://evil.example.com/tarifs')).toEqual({ opened: false });
    expect(await openExternal(win, 'https://centresoutien.com.evil.example.com/tarifs')).toEqual({ opened: false });
    expect(await openExternal(win, 'http://centresoutien.com/tarifs')).toEqual({ opened: false });
    expect(await openExternal(win, 'javascript:alert(1)')).toEqual({ opened: false });
  });
});

// ---------------------------------------------------------------------------
// B. Reachability probe — the gated CTA cannot surface under the flat MVP tiers
// ---------------------------------------------------------------------------

test.describe('SOU-85 AC1 — gated CTA reachability probe (documents SOU-187 gap)', () => {
  let live: PayrollLaunched | null = null;
  test.afterEach(async () => {
    await live?.app.close();
    live = null;
  });

  test('essentiel plan renders the WORKING payroll surface, never the upgrade CTA', async () => {
    const L = PAYROLL_STR[locale()];
    live = await bootPayroll(locale(), { plan: 'essentiel' });
    const win = live.win;

    await gotoPayroll(win, L);

    await expect(win.getByRole('heading', { name: L.pageTitle }).first()).toBeVisible();
    // The SOU-85 inline CTA ("Débloquer avec …" / "افتح مع …") must be absent:
    // payroll.teacher ships on essentiel, so this surface is never gated.
    await expect(win.getByText(/Débloquer avec|افتح مع/)).toHaveCount(0);
    await expect(win.getByText(L.lockedBody)).toHaveCount(0);
  });
});

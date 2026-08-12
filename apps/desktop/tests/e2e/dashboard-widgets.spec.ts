import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  VALID_ADMIN,
  boot,
  launch,
  pageCrashed,
  type Launched,
  type Locale,
} from './dashboard.fixtures';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * SOU-231 — Dashboard widget show/hide + reorder configuration.
 *
 * Black-box, driven only through the packaged app and the public preload
 * bridge. Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * The customize panel persists per device in localStorage (same pattern as the
 * SOU-59 Basique/Avancé toggle). Scenarios:
 *
 *   1. Hiding a widget removes it immediately AND survives a full app relaunch
 *      against the same user-data dir (the "survives restart" acceptance
 *      criterion — localStorage lives in the dir, so a genuine relaunch is the
 *      only faithful test).
 *   2. Reordering swaps widget order within a panel via the up/down arrows.
 *   3. Gated-widget locked-state reachability probe (documents the SOU-187
 *      feature-drop seam gap, mirroring upgrade-cta.spec.ts): under the SOU-83
 *      flat MVP tiers, `dashboard.advanced` ships on every plan, so no Avancé
 *      widget can be driven into its LockOverlay state through the packaged
 *      app — that surface is proven at the component layer instead.
 */

const locale = () => test.info().project.name as Locale;

const WIDGET_NAMES: Record<Locale, Record<string, string>> = {
  fr: {
    seances: 'Séances cette semaine',
    effectifs: 'Effectifs',
    teacherLoad: 'Charge enseignants / semaine',
  },
  ar: {
    seances: 'الحصص هذا الأسبوع',
    effectifs: 'التعداد',
    teacherLoad: 'عبء المدرسين / أسبوع',
  },
};

/** The customize gear button's aria-label (i18n `dashboard.widgets.customize`). */
function customizeLabel(loc: Locale): string {
  return loc === 'fr' ? 'Personnaliser le tableau de bord' : 'تخصيص لوحة القيادة';
}

function hideLabel(loc: Locale, widget: string): string {
  return loc === 'fr' ? `Masquer ${widget}` : `إخفاء ${widget}`;
}

function moveUpLabel(loc: Locale, widget: string): string {
  return loc === 'fr' ? `Monter ${widget}` : `تحريك ${widget} للأعلى`;
}

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Dashboard rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

async function openCustomize(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('button', { name: customizeLabel(loc) }).click();
  await expect(win.getByRole('dialog')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — hiding a widget removes it immediately and survives a relaunch.
// ---------------------------------------------------------------------------
test('Scenario 1 — hiding a widget removes it immediately and survives an app relaunch', async () => {
  const loc = locale();
  const L = STR[loc];
  const dir = mkdtempSync(join(tmpdir(), 'cs-e2e-dashboard-widgets-'));

  live = await launch(loc, 'premium', dir);
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  const win = live.win;
  await assertMounted(win, L);

  // The Séances widget is visible by default.
  const seances = win.getByText(WIDGET_NAMES[loc].seances, { exact: true }).first();
  await expect(seances).toBeVisible();

  // Hide it through the customize sheet.
  await openCustomize(win, loc);
  await win.getByRole('checkbox', { name: hideLabel(loc, WIDGET_NAMES[loc].seances) }).click();
  await win.screenshot({ path: `test-results/dashboard-widgets-hide-${loc}.png` });

  // Immediate effect: the section heading is gone from the live dashboard.
  // (Scoped to the level-2 heading — the sheet's checklist row still shows the
  // widget name even when unchecked.)
  await expect(win.getByRole('heading', { level: 2, name: WIDGET_NAMES[loc].seances })).toHaveCount(0);

  // Full app relaunch against the SAME user-data dir → still hidden.
  await live.app.close();
  live = null;
  live = await launch(loc, 'premium', dir);
  await live.win.waitForLoadState('domcontentloaded');
  await assertMounted(live.win, L);
  expect(await pageCrashed(live.win)).toBe(false);
  await expect(live.win.getByRole('heading', { level: 2, name: WIDGET_NAMES[loc].seances })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 2 — reorder swaps widget order within a panel via up/down arrows.
// ---------------------------------------------------------------------------
test('Scenario 2 — reorder swaps widget order within a panel', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc);
  const win = live.win;
  await assertMounted(win, L);
  await openCustomize(win, loc);

  // In the default order, the Effectifs row sits above the teacher-load row
  // inside the "Vue Basique" checklist section. Locate both rows and record
  // their vertical position before the move.
  const effectifsCheckbox = win.getByRole('checkbox', { name: hideLabel(loc, WIDGET_NAMES[loc].effectifs) });
  const teacherCheckbox = win.getByRole('checkbox', { name: hideLabel(loc, WIDGET_NAMES[loc].teacherLoad) });
  await expect(effectifsCheckbox).toBeVisible();
  await expect(teacherCheckbox).toBeVisible();

  const top = (locator: ReturnType<Page['getByRole']>) => locator.evaluate((el: Element) => el.getBoundingClientRect().top);
  expect(await top(teacherCheckbox), 'teacher-load starts below effectifs').toBeGreaterThan(await top(effectifsCheckbox));

  // Move the teacher-load widget one step up.
  await win.getByRole('button', { name: moveUpLabel(loc, WIDGET_NAMES[loc].teacherLoad) }).click();
  await win.screenshot({ path: `test-results/dashboard-widgets-reorder-${loc}.png` });

  // It must now sit strictly above the effectifs one.
  expect(await top(teacherCheckbox), 'teacher-load moved above effectifs after the up click').toBeLessThan(
    await top(effectifsCheckbox),
  );
});

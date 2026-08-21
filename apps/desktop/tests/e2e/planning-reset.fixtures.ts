import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-295 — the planner "réinitialiser le planning" danger
 * zone. Driven only through the running packaged app and the public preload
 * bridge. Every asserted string was mirrored from the shipped i18n bundle in both
 * locales, never re-derived in the test.
 *
 * The reset runs against the interim mock gateway (the real `planning.reset` IPC
 * handler is built by the domain agent in parallel), so the flow — trigger, cutoff
 * choice, typed-confirmation gate, success toast — is fully exercisable; the toast
 * count is the mock's zero.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const STR: Record<
  Locale,
  {
    navPlanning: string;
    planningTitle: string;
    resetTrigger: string;
    dialogTitle: string;
    cutoffToday: string;
    cutoffTomorrow: string;
    confirmWord: string;
    confirmButton: string;
    successPrefix: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    navPlanning: 'Planning',
    planningTitle: 'Planning hebdomadaire',
    resetTrigger: 'Réinitialiser le planning',
    dialogTitle: 'Réinitialiser le planning ?',
    cutoffToday: "Inclure aujourd'hui",
    cutoffTomorrow: 'À partir de demain',
    confirmWord: 'RÉINITIALISER',
    confirmButton: 'Réinitialiser le planning',
    successPrefix: 'Planning réinitialisé',
    dir: 'ltr',
  },
  ar: {
    navPlanning: 'الجدولة',
    planningTitle: 'الجدول الأسبوعي',
    resetTrigger: 'إعادة تعيين الجدول',
    dialogTitle: 'إعادة تعيين الجدول؟',
    cutoffToday: 'تضمين اليوم',
    cutoffTomorrow: 'ابتداءً من الغد',
    confirmWord: 'إعادة التعيين',
    confirmButton: 'إعادة تعيين الجدول',
    successPrefix: 'تمت إعادة تعيين الجدول',
    dir: 'rtl',
  },
};

export type Launched = { app: ElectronApplication; win: Page };
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-planning-reset-'));
}

export async function launch(
  locale: Locale,
  options: { omitFeatures?: readonly string[] } = {},
): Promise<Launched> {
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' };
  delete env['CS_E2E_OMIT_FEATURES'];
  if (options.omitFeatures && options.omitFeatures.length > 0) {
    env['CS_E2E_OMIT_FEATURES'] = options.omitFeatures.join(',');
  }
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const bw = await app.browserWindow(win);
  await bw.evaluate((w: { setBounds: (b: object) => void }) => w.setBounds({ x: 0, y: 0, width: 1500, height: 1200 }));
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  return { app, win };
}

/** Reload past the boot wizard / auth gate, open the weekly planner via the sidebar. */
export async function gotoPlanner(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error|Une erreur est survenue|حدث خطأ/i.test(document.body.innerText),
  );
}

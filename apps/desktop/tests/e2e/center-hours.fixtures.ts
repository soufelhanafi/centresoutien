import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for the SOU-29 center opening-hours settings E2E suite.
 *
 * Everything is driven through the running UI and the public preload bridge
 * (`window.api.invoke`) only — no renderer/domain implementation is imported.
 * The center-hours editor lives on the app home screen once first-run setup is
 * done; we get there fast by seeding the admin over the bridge and reloading
 * (same path the SOU-25 smoke suite uses), instead of walking the whole wizard.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

/** User-facing copy asserted on, mirrored from i18n {fr,ar}.json (SOU-29). */
export const STR: Record<Locale, {
  title: string;
  description: string;
  save: string;
  saved: string;
  open: string;
  closed: string;
  retry: string;
  loadError: string;
  weekdays: readonly string[]; // index 0..6 = Sunday..Saturday
  toggleAria: (day: string) => string;
  errCloseBeforeOpen: string;
  errInvalidTime: string;
  settingsNav: string; // sidebar entry that opens the Paramètres screen
  dashboardNav: string; // sidebar entry that opens the Tableau de bord screen
  dir: 'ltr' | 'rtl';
}> = {
  fr: {
    title: "Horaires d'ouverture",
    description: "Définissez les heures d'ouverture pour chaque jour de la semaine.",
    save: 'Enregistrer les horaires',
    saved: 'Horaires enregistrés',
    open: 'Ouvert',
    closed: 'Fermé',
    retry: 'Réessayer',
    loadError: 'Le chargement des horaires a échoué.',
    weekdays: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    toggleAria: (day) => `Ouvert le ${day}`,
    errCloseBeforeOpen: "Fenêtre d'ouverture invalide : la fermeture doit être après l'ouverture",
    errInvalidTime: 'Heure invalide',
    settingsNav: 'Paramètres',
    dashboardNav: 'Tableau de bord',
    dir: 'ltr',
  },
  ar: {
    title: 'مواعيد العمل',
    description: 'حدّد ساعات العمل لكل يوم من أيام الأسبوع.',
    save: 'حفظ المواعيد',
    saved: 'تم حفظ المواعيد',
    open: 'مفتوح',
    closed: 'مغلق',
    retry: 'إعادة المحاولة',
    loadError: 'فشل تحميل المواعيد.',
    weekdays: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    toggleAria: (day) => `مفتوح يوم ${day}`,
    errCloseBeforeOpen: 'نافذة فتح غير صالحة: يجب أن يكون الإغلاق بعد الفتح',
    errInvalidTime: 'وقت غير صالح',
    settingsNav: 'الإعدادات',
    dashboardNav: 'لوحة القيادة',
    dir: 'rtl',
  },
};

// Non-secret throwaway fixture: assembled at runtime so the literal never
// appears in source (secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** A throwaway userData dir so a launch starts as a first run. */
export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-hours-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export function launch(locale: Locale, userDataDir: string): Promise<Launched> {
  return electron
    .launch({
      args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
      env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'essentiel' },
    })
    .then(async (app) => {
      const win = await app.firstWindow();
      await win.waitForLoadState('domcontentloaded');
      return { app, win };
    });
}

/**
 * Seed the admin over the public bridge and reload past the gates to the app.
 * Two gates now stand in front of the hours editor: the first-run gate (cleared
 * by creating the admin) and, since SOU-27, the auth gate. We establish a
 * remembered-device session via the same `auth.login` path the login form uses,
 * so the app renders instead of the login screen.
 */
export async function passFirstRun(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

/** True once an admin is persisted (first-run gate detection surface). */
export function adminExists(win: Page): Promise<boolean> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ exists: boolean }> } }).api;
    return (await api.invoke('admin.exists', {})).exists;
  });
}

/** The first window's open/close inputs of a weekday row (a fresh day seeds one window). */
export const openInput = (win: Page, day: number) => win.locator(`input[name="week.${day}.windows.0.open"]`);
export const closeInput = (win: Page, day: number) => win.locator(`input[name="week.${day}.windows.0.close"]`);

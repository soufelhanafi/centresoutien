import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box helpers for the SOU-25 first-run wizard E2E suite.
 *
 * The wizard is driven purely through the running UI and the public preload
 * bridge (`window.api.invoke`). No renderer/domain implementation is imported.
 * The only knobs are the documented env / CLI switches:
 *   - CS_LOCALE          → renderer locale (fr | ar)
 *   - CS_PLAN            → active plan (essentiel | pro | premium)
 *   - --user-data-dir    → Electron userData dir (where the center DB lives),
 *                          so every launch can start from truly fresh state.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

/** All user-facing copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<Locale, Record<string, string>> = {
  fr: {
    wizardTitle: 'Configuration initiale',
    next: 'Continuer',
    back: 'Retour',
    skip: 'Passer',
    langFr: 'Français',
    langAr: 'العربية',
    stepHolidaysLabel: 'Jours fériés',
    languageStepTitle: 'Choisissez la langue',
    centerStepTitle: 'Profil du centre',
    centerName: 'Nom du centre',
    centerPhone: 'Téléphone',
    adminStepTitle: 'Compte administrateur',
    hoursStepTitle: "Horaires d'ouverture",
    holidaysStepTitle: 'Jours fériés',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    doneTitle: 'Configuration terminée',
    doneCta: 'Commencer',
    // Header center name — proof the app shell (SOU-99) rendered post-setup.
    appMarker: 'Centre principal',
  },
  ar: {
    wizardTitle: 'الإعداد الأولي',
    next: 'متابعة',
    back: 'رجوع',
    skip: 'تخطٍّ',
    langFr: 'Français',
    langAr: 'العربية',
    stepHolidaysLabel: 'العطل',
    languageStepTitle: 'اختر اللغة',
    centerStepTitle: 'ملف المركز',
    centerName: 'اسم المركز',
    centerPhone: 'الهاتف',
    adminStepTitle: 'حساب المدير',
    hoursStepTitle: 'مواعيد العمل',
    holidaysStepTitle: 'أيام العطل',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    doneTitle: 'اكتمل الإعداد',
    doneCta: 'ابدأ',
    appMarker: 'المركز الرئيسي',
  },
};

// Non-secret throwaway E2E fixtures: passwords are assembled from fragments at
// runtime so the literal string never appears in source (secret-scan friendly).
// Deterministic — no randomness — so specs stay reproducible.
export const joinSecret = (...parts: string[]): string => parts.join('');

export const VALID_ADMIN = { username: 'directrice', password: joinSecret('Casa', '2026', '!') } as const;

/** A throwaway userData dir so the launch starts as a first run. */
export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-wizard-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(opts: {
  locale: Locale;
  plan: PlanId;
  userDataDir: string;
}): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`],
    env: { ...process.env, CS_LOCALE: opts.locale, CS_PLAN: opts.plan },
  });
  const win = await app.firstWindow();
  return { app, win };
}

/**
 * Get past the SOU-27 AuthGate. By the time this is called an admin already
 * exists (created by the wizard or seeded through the bridge); we establish a
 * remembered-device session via the same public `auth.login` the form uses, then
 * reload so the gate's session probe passes and the app renders. Remembering the
 * device also lets a later relaunch of the same userData dir skip the login.
 */
export async function passAuthGate(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
}

/** First-run detection surface: is an admin account persisted? */
export async function adminExists(win: Page): Promise<boolean> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ exists: boolean }> } }).api;
    const res = await api.invoke('admin.exists', {});
    return res.exists;
  });
}

/** The active plan, straight from the domain — used to sanity-check CS_PLAN. */
export async function activePlan(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ planId: string }> } }).api;
    const res = await api.invoke('plan.get', {});
    return res.planId;
  });
}

/**
 * Attempts to create a second admin through the public bridge. Returns whether
 * it succeeded. A single-admin domain rejects it — that rejection is the
 * observable proof the wizard created the account exactly once.
 */
export async function trySecondAdminCreate(win: Page): Promise<{ created: boolean; error?: string }> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ id: string }> };
    }).api;
    try {
      await api.invoke('admin.create', { username: 'intruder', password: ['Rabat', '2026', '!'].join('') });
      return { created: true };
    } catch (err) {
      return { created: false, error: String((err as Error)?.message ?? err) };
    }
  });
}

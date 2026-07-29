import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir, type Locale } from './wizard.fixtures';

/**
 * Black-box helpers for the SOU-27 login / session / lockout E2E suite.
 *
 * Everything is driven through the running UI and the public preload bridge
 * (`window.api.invoke`). No renderer/domain/data implementation is imported.
 * The bridge is used only where a value the *user* also observes needs to be
 * read deterministically (login outcome, session flag) — the visible UI is
 * always asserted alongside it.
 */

export { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir };
export type { Locale };

/** User-facing copy the specs assert on, mirrored from i18n fr/ar.json (`auth.*`). */
export const AUTH: Record<Locale, Record<string, string>> = {
  fr: {
    loginTitle: 'Connexion',
    subtitle: 'Connectez-vous pour accéder à votre centre',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    rememberDevice: 'Se souvenir de cet appareil',
    submit: 'Se connecter',
    logout: 'Se déconnecter',
    invalidCredentials: 'Nom d’utilisateur ou mot de passe incorrect.',
    invalidCredentialsLoose: 'mot de passe incorrect',
    lockedTitle: 'Compte temporairement verrouillé',
    usernameRequired: "Le nom d'utilisateur est requis",
    passwordRequired: 'Le mot de passe est requis',
    appHeading: 'Centre Soutien',
    appMarker: 'Nouvelle matière',
  },
  ar: {
    loginTitle: 'تسجيل الدخول',
    subtitle: 'سجّل الدخول للوصول إلى مركزك',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    rememberDevice: 'تذكّر هذا الجهاز',
    submit: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    invalidCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    invalidCredentialsLoose: 'غير صحيحة',
    lockedTitle: 'الحساب مقفل مؤقتًا',
    usernameRequired: 'اسم المستخدم مطلوب',
    passwordRequired: 'كلمة المرور مطلوبة',
    appHeading: 'مركز الدعم',
    appMarker: 'مادة جديدة',
  },
};

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

export type Launched = { app: ElectronApplication; win: Page };

/** Launch the packaged app against a given userData dir + locale. */
export async function launch(dir: string, locale: Locale): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env: { ...process.env, CS_LOCALE: locale },
  });
  const win = await app.firstWindow();
  return { app, win };
}

/** Seed the admin the first-run wizard (SOU-25) would create, then reload. */
export async function seedAdmin(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('admin.create', admin);
  }, VALID_ADMIN);
  await win.reload();
}

/** Launch with an admin already provisioned → the login screen is reachable. */
export async function launchLoggedOut(dir: string, locale: Locale): Promise<Launched> {
  const live = await launch(dir, locale);
  await seedAdmin(live.win);
  return live;
}

export type LoginOutcome =
  | { outcome: 'success' }
  | { outcome: 'invalid-credentials'; remainingAttempts: number }
  | { outcome: 'locked-out'; lockedUntilMs: number };

/** Invoke the throttled login through the public bridge (same path the form uses). */
export async function bridgeLogin(
  win: Page,
  input: { username: string; password: string; rememberDevice?: boolean },
): Promise<LoginOutcome> {
  return win.evaluate(async (req) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<LoginOutcome> };
    }).api;
    return api.invoke('auth.login', req);
  }, input) as Promise<LoginOutcome>;
}

/** Is this device still remembered? (startup session probe.) */
export async function sessionAuthenticated(win: Page): Promise<boolean> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ authenticated: boolean }> };
    }).api;
    const res = await api.invoke('auth.session', {});
    return res.authenticated;
  });
}

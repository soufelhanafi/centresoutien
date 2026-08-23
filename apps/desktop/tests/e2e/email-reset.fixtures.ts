import { _electron as electron, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir, type Launched, type Locale } from './wizard.fixtures';

/**
 * SOU-273 — password reset by email. Black-box fixtures: the app is driven only
 * through its UI and the public preload bridge (`window.api.invoke`); no
 * renderer/domain/data implementation is imported. Unlike the other auth suites
 * this flow talks to an external relay, so the app is pointed at a local mock via
 * the `CS_RELAY_URL` env (read only in the `__CS_E2E__` build) — see
 * `email-reset.mock-relay.ts`.
 */

export { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir };
export type { Launched, Locale };

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

/** The new password the reset sets — satisfies the strength rule, differs from VALID_ADMIN. */
export const NEW_PASSWORD = 'Nouveau2027';

/** User-facing copy the spec asserts on, mirrored from i18n fr/ar.json. */
export const RESET: Record<
  Locale,
  {
    settingsNav: string;
    securityTab: string;
    ownerEmailTitle: string;
    ownerEmailLabel: string;
    ownerEmailSave: string;
    ownerEmailSuccess: string;
    logout: string;
    username: string;
    password: string;
    loginSubmit: string;
    appMarker: string;
    forgotLink: string;
    methodEmail: string;
    sendCode: string;
    codeLabel: string;
    newPassword: string;
    confirmPassword: string;
    resetSubmit: string;
    successTitle: string;
    backToLogin: string;
  }
> = {
  fr: {
    settingsNav: 'Paramètres',
    securityTab: 'Questions de sécurité',
    ownerEmailTitle: 'E-mail de récupération',
    ownerEmailLabel: 'Adresse e-mail',
    ownerEmailSave: 'Enregistrer',
    ownerEmailSuccess: 'Adresse e-mail enregistrée',
    logout: 'Se déconnecter',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    loginSubmit: 'Se connecter',
    appMarker: 'Centre principal',
    forgotLink: 'Mot de passe oublié ?',
    methodEmail: 'Par e-mail',
    sendCode: 'Envoyer le code',
    codeLabel: 'Code à 6 chiffres',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    resetSubmit: 'Réinitialiser le mot de passe',
    successTitle: 'Mot de passe réinitialisé',
    backToLogin: 'Retour à la connexion',
  },
  ar: {
    settingsNav: 'الإعدادات',
    securityTab: 'أسئلة الأمان',
    ownerEmailTitle: 'بريد الاسترجاع الإلكتروني',
    ownerEmailLabel: 'عنوان البريد الإلكتروني',
    ownerEmailSave: 'حفظ',
    ownerEmailSuccess: 'تم حفظ عنوان البريد الإلكتروني',
    logout: 'تسجيل الخروج',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    loginSubmit: 'تسجيل الدخول',
    appMarker: 'المركز الرئيسي',
    forgotLink: 'هل نسيت كلمة المرور؟',
    methodEmail: 'عبر البريد الإلكتروني',
    sendCode: 'إرسال الرمز',
    codeLabel: 'رمز من 6 أرقام',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور',
    resetSubmit: 'إعادة تعيين كلمة المرور',
    successTitle: 'تمت إعادة تعيين كلمة المرور',
    backToLogin: 'العودة إلى تسجيل الدخول',
  },
};

/** The owner's contact address the reset flow sends a code to. */
export const OWNER_EMAIL = 'directrice@example.com';

/** Launch a fresh app pointed at the mock relay, seed the owner, and log in. */
export async function launchLoggedInWithRelay(
  dir: string,
  locale: Locale,
  relayUrl: string,
): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_RELAY_URL: relayUrl },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } })
      .api;
    await api.invoke('admin.create', admin);
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');

  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } })
      .api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');

  return { app, win };
}

/** Settings → security tab → set the owner recovery email through the real UI. */
export async function setOwnerEmailViaUi(win: Page, loc: Locale, email: string): Promise<void> {
  const L = RESET[loc];
  const navLink = win.getByRole('link', { name: L.settingsNav });
  if (await navLink.count()) await navLink.click();
  await win.getByRole('tab', { name: L.securityTab }).click();
  await win.getByText(L.ownerEmailTitle, { exact: true }).first().waitFor({ state: 'visible' });

  // The tab hosts two "save" forms (owner email + security questions); scope the
  // submit to the form that owns the email input so the correct one is clicked.
  const emailForm = win.locator('form').filter({ has: win.getByLabel(L.ownerEmailLabel, { exact: true }) });
  await win.getByLabel(L.ownerEmailLabel, { exact: true }).fill(email);
  await emailForm.getByRole('button', { name: L.ownerEmailSave }).click();
  await win.getByText(L.ownerEmailSuccess).waitFor({ state: 'visible' });
}

/** Log out through the app-shell button, returning to the login screen. */
export async function logoutViaUi(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('button', { name: RESET[loc].logout }).click();
  await win.getByRole('button', { name: RESET[loc].loginSubmit }).waitFor({ state: 'visible' });
}

/** Log in through the login form and wait for the authenticated shell. */
export async function loginViaUi(win: Page, loc: Locale, password: string): Promise<void> {
  const L = RESET[loc];
  await win.getByLabel(L.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(L.password, { exact: true }).fill(password);
  await win.getByRole('button', { name: L.loginSubmit }).click();
  await win.getByText(L.appMarker).first().waitFor({ state: 'visible' });
}

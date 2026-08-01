import { _electron as electron, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir, type Launched, type Locale } from './wizard.fixtures';
import { CP, completeSetupAndLogin } from './center-profile.fixtures';

/**
 * SOU-31 — Settings page tabs (black-box) E2E fixtures.
 *
 * Drives the running app only through the UI and the public preload bridge
 * (`window.api.invoke`). No renderer/domain implementation is imported.
 *
 * The Settings surface is a tabbed layout with six tabs: Center Profile,
 * Center Hours, Holidays, Password, Language, Plan. This file adds copy and
 * helpers for the three NEW tabs (Password, Language, Plan) plus a tab-nav
 * helper shared across all six. Profile/Hours/Holidays copy is reused from
 * their existing fixtures (`center-profile.fixtures`, `center-hours.fixtures`,
 * `holidays.fixtures`) so the regression checks assert the exact same strings
 * those dedicated suites already cover.
 */

export { freshUserDataDir, VALID_ADMIN, completeSetupAndLogin, type Launched, type Locale };

export type SettingsStrings = {
  tabs: {
    profile: string;
    hours: string;
    holidays: string;
    password: string;
    language: string;
    plan: string;
  };
  password: {
    heading: string;
    current: string;
    new: string;
    confirm: string;
    submit: string;
    success: string;
    errWrongCurrent: string;
    errMismatch: string;
  };
  language: {
    heading: string;
    fr: string;
    ar: string;
  };
  plan: {
    heading: string;
    limitsHeading: string;
    featuresHeading: string;
  };
  auth: {
    username: string;
    password: string;
    submit: string;
    logout: string;
    invalidCredentialsLoose: string;
  };
  dir: 'ltr' | 'rtl';
};

export const S: Record<Locale, SettingsStrings> = {
  fr: {
    tabs: {
      profile: 'Profil',
      hours: 'Horaires',
      holidays: 'Vacances',
      password: 'Mot de passe',
      language: 'Langue',
      plan: 'Formule',
    },
    password: {
      heading: 'Changer le mot de passe',
      current: 'Mot de passe actuel',
      new: 'Nouveau mot de passe',
      confirm: 'Confirmer le nouveau mot de passe',
      submit: 'Mettre à jour',
      success: 'Mot de passe mis à jour',
      errWrongCurrent: 'Mot de passe actuel incorrect',
      errMismatch: 'Les mots de passe ne correspondent pas',
    },
    language: {
      heading: 'Langue',
      fr: 'Français',
      ar: 'العربية',
    },
    plan: {
      heading: 'Votre formule',
      limitsHeading: 'Limites',
      featuresHeading: 'Fonctionnalités incluses',
    },
    auth: {
      username: "Nom d'utilisateur",
      password: 'Mot de passe',
      submit: 'Se connecter',
      logout: 'Se déconnecter',
      invalidCredentialsLoose: 'mot de passe incorrect',
    },
    dir: 'ltr',
  },
  ar: {
    tabs: {
      profile: 'الملف الشخصي',
      hours: 'المواعيد',
      holidays: 'العطل',
      password: 'كلمة المرور',
      language: 'اللغة',
      plan: 'الباقة',
    },
    password: {
      heading: 'تغيير كلمة المرور',
      current: 'كلمة المرور الحالية',
      new: 'كلمة المرور الجديدة',
      confirm: 'تأكيد كلمة المرور الجديدة',
      submit: 'تحديث',
      success: 'تم تحديث كلمة المرور',
      errWrongCurrent: 'كلمة المرور الحالية غير صحيحة',
      errMismatch: 'كلمتا المرور غير متطابقتين',
    },
    language: {
      heading: 'اللغة',
      fr: 'Français',
      ar: 'العربية',
    },
    plan: {
      heading: 'باقتك',
      limitsHeading: 'الحدود',
      featuresHeading: 'الميزات المتضمنة',
    },
    auth: {
      username: 'اسم المستخدم',
      password: 'كلمة المرور',
      submit: 'تسجيل الدخول',
      logout: 'تسجيل الخروج',
      invalidCredentialsLoose: 'غير صحيحة',
    },
    dir: 'rtl',
  },
};

/** Launch with an explicit locale override (mirrors wizard.fixtures.launch but named for readability here). */
export async function launch(opts: { locale: Locale; plan: 'essentiel' | 'pro' | 'premium'; userDataDir: string }): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`],
    env: { ...process.env, CS_LOCALE: opts.locale, CS_PLAN: opts.plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Launch WITHOUT a CS_LOCALE override — used only for the language-persistence
 * scenario, where CS_LOCALE (a deterministic test knob) would otherwise mask
 * whatever locale preference the main process actually persisted and re-read
 * at window creation.
 */
export async function launchNoLocaleOverride(opts: { plan: 'essentiel' | 'pro' | 'premium'; userDataDir: string }): Promise<Launched> {
  const env = { ...process.env, CS_PLAN: opts.plan };
  delete (env as Record<string, string | undefined>).CS_LOCALE;
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Navigate to Settings (if not already there) and switch to a given tab. */
export async function gotoSettingsTab(win: Page, loc: Locale, tabName: string): Promise<void> {
  const navLabel = loc === 'ar' ? 'الإعدادات' : 'Paramètres';
  const navLink = win.getByRole('link', { name: navLabel });
  if (await navLink.count()) {
    await navLink.click();
  }
  await win.getByRole('tab', { name: tabName }).click();
}

/** Simplest settings nav: open the Paramètres/الإعدادات page (lands on the first tab, Profile). */
export async function gotoSettings(win: Page, loc: Locale): Promise<void> {
  const navLabel = loc === 'ar' ? 'الإعدادات' : 'Paramètres';
  await win.getByRole('link', { name: navLabel }).click();
  await win.getByRole('tab', { name: S[loc].tabs.profile }).waitFor({ state: 'visible' });
}

export function passwordForm(win: Page) {
  return {
    current: () => win.locator('input[name="currentPassword"]'),
    next: () => win.locator('input[name="newPassword"]'),
    confirm: () => win.locator('input[name="confirmNewPassword"]'),
  };
}

/** Log out through the visible header control. */
export async function logout(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('button', { name: S[loc].auth.logout }).click();
}

/** Log back in through the visible login form (not the bridge) — the real user path. */
export async function loginViaForm(win: Page, loc: Locale, password: string): Promise<void> {
  const t = S[loc].auth;
  await win.getByLabel(t.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(t.password, { exact: true }).fill(password);
  await win.getByRole('button', { name: t.submit }).click();
}

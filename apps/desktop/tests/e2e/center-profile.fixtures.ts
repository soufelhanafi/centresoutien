import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Page } from '@playwright/test';
import { VALID_ADMIN, type Locale } from './wizard.fixtures';

/**
 * SOU-28 — Center profile, black-box E2E fixtures.
 *
 * Drives the running app only through the UI and the public preload bridge
 * (`window.api.invoke`). No renderer/domain implementation is imported. The
 * center profile lives in a Settings surface and (per the ticket) a first-run
 * wizard step. These helpers walk the SOU-25 wizard to reach the logged-in app
 * shell where the Settings center-profile form renders.
 */

export { launch, freshUserDataDir, VALID_ADMIN, type Launched, type Locale } from './wizard.fixtures';

/** User-facing copy the specs assert on, mirrored from i18n fr/ar.json. */
export const CP: Record<
  Locale,
  {
    langRadio: string;
    next: string;
    skip: string;
    doneCta: string;
    settingsNav: string;
    username: string;
    password: string;
    confirmPassword: string;
    wizardCenterTitle: string;
    nameLabel: string;
    addressLabel: string;
    phoneLabel: string;
    emailLabel: string;
    logoLabel: string;
    planLabel: string;
    submit: string;
    saveSuccess: string;
    logoPick: string;
    logoReplace: string;
    logoRemove: string;
    errRequired: string;
    errInvalidEmail: string;
  }
> = {
  fr: {
    langRadio: 'Français',
    next: 'Continuer',
    skip: 'Passer',
    doneCta: 'Commencer',
    settingsNav: 'Paramètres',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    wizardCenterTitle: 'Profil du centre',
    nameLabel: 'Nom du centre',
    addressLabel: 'Adresse',
    phoneLabel: 'Téléphone',
    emailLabel: 'E-mail',
    logoLabel: 'Logo',
    planLabel: 'Formule',
    submit: 'Enregistrer',
    saveSuccess: 'Profil enregistré',
    logoPick: 'Choisir un logo',
    logoReplace: 'Changer le logo',
    logoRemove: 'Retirer',
    errRequired: 'Ce champ est requis',
    errInvalidEmail: 'Adresse e-mail invalide',
  },
  ar: {
    langRadio: 'العربية',
    next: 'متابعة',
    skip: 'تخطٍّ',
    doneCta: 'ابدأ',
    settingsNav: 'الإعدادات',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    wizardCenterTitle: 'ملف المركز',
    nameLabel: 'اسم المركز',
    addressLabel: 'العنوان',
    phoneLabel: 'الهاتف',
    emailLabel: 'البريد الإلكتروني',
    logoLabel: 'الشعار',
    planLabel: 'الباقة',
    submit: 'حفظ',
    saveSuccess: 'تم حفظ الملف',
    logoPick: 'اختيار شعار',
    logoReplace: 'تغيير الشعار',
    logoRemove: 'إزالة',
    errRequired: 'هذا الحقل مطلوب',
    errInvalidEmail: 'عنوان بريد إلكتروني غير صالح',
  },
};

/** A 1×1 transparent PNG written to a real temp file for the logo <input type=file>. */
export function makeLogoFile(): string {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f0005000101a5f645b70000000049454e44ae426082',
    'hex',
  );
  const p = join(mkdtempSync(join(tmpdir(), 'cs-logo-')), 'logo.png');
  writeFileSync(p, png);
  return p;
}

/** The persisted center row, straight from the public bridge (or null when unset). */
export async function getCenter(win: Page): Promise<null | {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoPath: string | null;
  plan: string;
}> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ center: unknown }> };
    }).api;
    const res = await api.invoke('center.get', {});
    return res.center as never;
  });
}

/**
 * Walks the SOU-25 first-run wizard to the logged-in app shell.
 *
 * The Center Profile step is now real and blocking (SOU-111): it requires a name
 * and a valid phone before Continue advances. The dedicated wizard spec asserts
 * that behaviour; this helper only fills the minimum required to land specs on
 * the Settings surface deterministically. Runs the app on `pro` so the plan
 * mirror shows a real tier and the Holidays step exists.
 */
export async function completeSetupAndLogin(win: Page, loc: Locale): Promise<void> {
  const t = CP[loc];
  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click(); // language -> center
  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre principal');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByRole('button', { name: t.next }).click(); // center -> admin
  await win.getByLabel(t.username, { exact: true }).fill(VALID_ADMIN.username);
  await win.getByLabel(t.password, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByLabel(t.confirmPassword, { exact: true }).fill(VALID_ADMIN.password);
  await win.getByRole('button', { name: t.next }).click(); // create admin -> hours
  await win.getByRole('button', { name: t.next }).click(); // hours -> holidays (pro)
  const skip = win.getByRole('button', { name: t.skip });
  if (await skip.count()) await skip.click();
  const done = win.getByRole('button', { name: t.doneCta });
  if (await done.count()) await done.click();
  await win.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await gotoSettings(win, loc);
}

/**
 * Establish a remembered-device session through the public bridge, reload, and
 * land on the Settings page. For relaunch scenarios where the SOU-27 auth gate
 * may show the login screen. This isolates the SOU-28 persistence check from
 * SOU-27 session behaviour.
 */
export async function bridgeLoginAndReload(win: Page, loc: Locale): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await gotoSettings(win, loc);
}

/** The Settings center-profile form, disambiguated from the Subject form by its phone field. */
export function centerFormLocator(win: Page) {
  return win.locator('form', { has: win.locator('input[name="phone"]') });
}

/** Convenience accessors scoped to the Settings center-profile form. */
export function centerForm(win: Page, loc: Locale) {
  const t = CP[loc];
  return {
    name: () => win.getByLabel(t.nameLabel, { exact: true }),
    address: () => win.getByLabel(t.addressLabel, { exact: true }),
    phone: () => win.getByLabel(t.phoneLabel, { exact: true }),
    email: () => win.getByLabel(t.emailLabel, { exact: true }),
    logo: () => win.getByLabel(t.logoLabel, { exact: true }),
    // Scope the submit to the center-profile form: the Settings page also hosts
    // the center-hours editor whose "Enregistrer les horaires" button would
    // otherwise collide with this "Enregistrer" under Playwright strict mode.
    submit: () => centerFormLocator(win).getByRole('button', { name: t.submit, exact: true }),
  };
}

/** Navigate from the app shell to the Settings page and wait for the center-profile form. */
export async function gotoSettings(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('link', { name: CP[loc].settingsNav }).click();
  await centerFormLocator(win).locator('input[name="phone"]').waitFor({ state: 'visible' });
}

import { type Page, expect } from '@playwright/test';
import { launch, freshUserDataDir, VALID_ADMIN, type Launched, type Locale } from './settings-tabs.fixtures';
import { completeSetupAndLogin } from './center-profile.fixtures';

/**
 * SOU-256 (slice B) — Team/Users settings + one-time setup code + first-login
 * redeem, black-box E2E fixtures.
 *
 * Everything is driven through the running UI and the public preload bridge
 * (`window.api.invoke`) exactly as the real user / renderer would. No
 * renderer/domain/data implementation is imported. All asserted copy is mirrored
 * from i18n fr/ar.json (`team.*`, `auth.setup.*`, `errors.*`).
 */

export { launch, freshUserDataDir, VALID_ADMIN, completeSetupAndLogin, type Launched, type Locale };

export type TeamStrings = {
  dir: 'ltr' | 'rtl';
  settingsNav: string;
  tabTeam: string;
  teamTitle: string;
  teamSubtitle: string;
  addEmployee: string;
  formSubmit: string;
  fullNameLabel: string;
  roleSecretary: string;
  roleOwner: string;
  emptyTitle: string;
  emptyBody: string;
  statusPending: string;
  statusActive: string;
  tableUsername: string;
  tableRole: string;
  tableStatus: string;
  setupCodeTitle: string;
  setupCodeCopy: string;
  setupCodeCopied: string;
  setupCodeWarning: string;
  setupCodeDone: string;
  usernameAlreadyTaken: string;
  createdToast: string;
  // login + redeem
  logout: string;
  loginTitle: string;
  usernameLabel: string;
  passwordLabel: string;
  loginSubmit: string;
  setupLinkPartial: string;
  setupTitle: string;
  setupCodeLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  setupContinue: string;
  setupSubmit: string;
  setupSuccess: string;
  setupCodeInvalid: string;
  recoveryHint: string;
  reissueAction: string;
  pendingName: string;
  appMarker: string;
};

export const T: Record<Locale, TeamStrings> = {
  fr: {
    dir: 'ltr',
    settingsNav: 'Paramètres',
    tabTeam: 'Équipe',
    teamTitle: 'Équipe',
    teamSubtitle: "Invitez vos employés et gérez leurs accès à l'application.",
    addEmployee: 'Ajouter un employé',
    formSubmit: 'Créer le compte',
    fullNameLabel: 'Nom complet (facultatif)',
    roleSecretary: 'Secrétaire',
    roleOwner: 'Propriétaire',
    emptyTitle: "Aucun employé pour l'instant",
    emptyBody: "Ajoutez un employé pour lui donner accès à l'application avec son propre compte.",
    statusPending: "En attente d'activation",
    statusActive: 'Actif',
    tableUsername: "Nom d'utilisateur",
    tableRole: 'Rôle',
    tableStatus: 'Statut',
    setupCodeTitle: "Code d'installation créé",
    setupCodeCopy: 'Copier le code',
    setupCodeCopied: 'Code copié',
    setupCodeWarning:
      "Ce code n'est affiché qu'une seule fois. Notez-le ou copiez-le maintenant : il ne pourra plus être consulté après la fermeture de cette fenêtre.",
    setupCodeDone: "J'ai noté le code",
    usernameAlreadyTaken: "Ce nom d'utilisateur est déjà utilisé",
    createdToast: "Le compte a été créé. L'employé peut maintenant se connecter.",
    logout: 'Se déconnecter',
    loginTitle: 'Connexion',
    usernameLabel: "Nom d'utilisateur",
    passwordLabel: 'Mot de passe',
    loginSubmit: 'Se connecter',
    setupLinkPartial: 'Première connexion',
    setupTitle: 'Activer mon compte',
    setupCodeLabel: "Code d'installation",
    newPasswordLabel: 'Nouveau mot de passe',
    confirmPasswordLabel: 'Confirmer le mot de passe',
    setupContinue: 'Continuer',
    setupSubmit: 'Activer mon compte',
    setupSuccess: 'Compte activé. Connectez-vous avec votre nouveau mot de passe.',
    setupCodeInvalid: "Code d'installation invalide",
    recoveryHint: 'Votre compte existe déjà. Choisissez un nouveau mot de passe pour y accéder à nouveau.',
    reissueAction: 'Nouveau code',
    pendingName: 'Compte non activé',
    appMarker: 'Centre principal',
  },
  ar: {
    dir: 'rtl',
    settingsNav: 'الإعدادات',
    tabTeam: 'الفريق',
    teamTitle: 'الفريق',
    teamSubtitle: 'ادعُ موظفيك وأدِر وصولهم إلى التطبيق.',
    addEmployee: 'إضافة موظف',
    formSubmit: 'إنشاء الحساب',
    fullNameLabel: 'الاسم الكامل (اختياري)',
    roleSecretary: 'سكرتير',
    roleOwner: 'المالك',
    emptyTitle: 'لا يوجد موظفون بعد',
    emptyBody: 'أضف موظفًا لمنحه حق الوصول إلى التطبيق بحسابه الخاص.',
    statusPending: 'في انتظار التفعيل',
    statusActive: 'نشط',
    tableUsername: 'اسم المستخدم',
    tableRole: 'الدور',
    tableStatus: 'الحالة',
    setupCodeTitle: 'تم إنشاء رمز التفعيل',
    setupCodeCopy: 'نسخ الرمز',
    setupCodeCopied: 'تم نسخ الرمز',
    setupCodeWarning:
      'يُعرَض هذا الرمز مرة واحدة فقط. دوّنه أو انسخه الآن: لن يمكن الاطلاع عليه مجددًا بعد إغلاق هذه النافذة.',
    setupCodeDone: 'لقد دوّنت الرمز',
    usernameAlreadyTaken: 'اسم المستخدم هذا مستعمل بالفعل',
    createdToast: 'تم إنشاء الحساب. يمكن للموظف الآن تسجيل الدخول.',
    logout: 'تسجيل الخروج',
    loginTitle: 'تسجيل الدخول',
    usernameLabel: 'اسم المستخدم',
    passwordLabel: 'كلمة المرور',
    loginSubmit: 'تسجيل الدخول',
    setupLinkPartial: 'أول تسجيل دخول',
    setupTitle: 'تفعيل حسابي',
    setupCodeLabel: 'رمز التفعيل',
    newPasswordLabel: 'كلمة المرور الجديدة',
    confirmPasswordLabel: 'تأكيد كلمة المرور',
    setupContinue: 'متابعة',
    setupSubmit: 'تفعيل حسابي',
    setupSuccess: 'تم تفعيل الحساب. سجّل الدخول بكلمة مرورك الجديدة.',
    setupCodeInvalid: 'رمز التفعيل غير صالح',
    recoveryHint: 'حسابك موجود بالفعل. اختر كلمة مرور جديدة لاستعادة الوصول إليه.',
    reissueAction: 'رمز جديد',
    pendingName: 'حساب غير مفعّل',
    appMarker: 'المركز الرئيسي',
  },
};

/** From the logged-in app shell, open Settings and switch to the Team tab. */
export async function gotoTeamTab(win: Page, loc: Locale): Promise<void> {
  const t = T[loc];
  const nav = win.getByRole('link', { name: t.settingsNav });
  if (await nav.count()) await nav.click();
  await win.getByRole('tab', { name: t.tabTeam }).click();
  await expect(win.getByText(t.teamSubtitle)).toBeVisible();
}

/** Open the invite dialog (header CTA — always present whether roster is empty or not). */
export async function openInviteDialog(win: Page, loc: Locale): Promise<void> {
  const t = T[loc];
  await win.getByRole('button', { name: t.addEmployee }).first().click();
  await expect(win.getByRole('dialog')).toBeVisible();
}

/**
 * Fill the add-employee dialog with director-set credentials and submit. The
 * account is created active — the employee can then sign in directly with these
 * credentials, no code to redeem.
 */
export async function createEmployeeViaForm(
  win: Page,
  input: { fullName?: string; username: string; password: string },
  loc: Locale,
): Promise<void> {
  const t = T[loc];
  const dialog = win.getByRole('dialog');
  if (input.fullName !== undefined) {
    await dialog.getByLabel(t.fullNameLabel, { exact: true }).fill(input.fullName);
  }
  await dialog.getByLabel(t.usernameLabel, { exact: true }).fill(input.username);
  await dialog.getByLabel(t.passwordLabel, { exact: true }).fill(input.password);
  await dialog.getByLabel(t.confirmPasswordLabel, { exact: true }).fill(input.password);
  await win.getByRole('button', { name: t.formSubmit }).click();
}

/** Create an employee straight through the public bridge (director-set credentials). */
export async function createEmployeeViaBridge(
  win: Page,
  input: { username: string; password: string },
): Promise<void> {
  await win.evaluate(async (payload) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('user.create', { role: 'secretary', ...payload });
  }, input);
}

/** Re-issue a fresh code for the single non-owner (invitable) row on the roster. */
export async function reissueFirstStaff(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('button', { name: T[loc].reissueAction }).first().click();
}

/** Read the one-time setup code from the success dialog's <code> element. */
export async function readSetupCode(win: Page): Promise<string> {
  const code = win.getByRole('dialog').locator('code').first();
  await expect(code).toBeVisible();
  return (await code.textContent())?.trim() ?? '';
}

/** Log out through the visible header control → back to the login screen. */
export async function logout(win: Page, loc: Locale): Promise<void> {
  await win.getByRole('button', { name: T[loc].logout }).click();
  await expect(win.getByRole('heading', { name: T[loc].loginTitle })).toBeVisible();
}

/** From the login screen, open the first-login (redeem) screen. */
export async function gotoRedeem(win: Page, loc: Locale): Promise<void> {
  await win.getByText(T[loc].setupLinkPartial, { exact: false }).click();
  await expect(win.getByRole('heading', { name: T[loc].setupTitle })).toBeVisible();
}

/** Step 1 of redeem: enter the code and continue. Used on its own for the
 *  garbage-code case (which must fail at step 1, before any identity fields). */
export async function enterSetupCode(win: Page, setupCode: string, loc: Locale): Promise<void> {
  await win.locator('input[name="setupCode"]').fill(setupCode);
  await win.getByRole('button', { name: T[loc].setupContinue }).click();
}

/** Second step of recovery redeem: set a new password only (no identity). Assumes
 *  the caller has already entered the code with {@link enterSetupCode} and is on
 *  the new-password step — so it never re-enters the code (the input is gone by
 *  now). */
export async function redeemRecovery(
  win: Page,
  input: { newPassword: string },
  loc: Locale,
): Promise<void> {
  await win.locator('input[name="newPassword"]').fill(input.newPassword);
  await win.locator('input[name="confirmPassword"]').fill(input.newPassword);
  await win.getByRole('button', { name: T[loc].setupSubmit }).click();
}

/** Log in through the visible login form (real user path). */
export async function loginViaForm(win: Page, username: string, password: string, loc: Locale): Promise<void> {
  const t = T[loc];
  await win.getByLabel(t.usernameLabel, { exact: true }).fill(username);
  await win.getByLabel(t.passwordLabel, { exact: true }).fill(password);
  await win.getByRole('button', { name: t.loginSubmit }).click();
}

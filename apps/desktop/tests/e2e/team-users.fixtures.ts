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
  setupSubmit: string;
  setupSuccess: string;
  setupCodeInvalid: string;
  setupCodeAlreadyRedeemed: string;
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
    setupSubmit: 'Activer mon compte',
    setupSuccess: 'Compte activé. Connectez-vous avec votre nouveau mot de passe.',
    setupCodeInvalid: "Code d'installation invalide",
    setupCodeAlreadyRedeemed: "Ce code d'installation a déjà été utilisé",
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
    setupSubmit: 'تفعيل حسابي',
    setupSuccess: 'تم تفعيل الحساب. سجّل الدخول بكلمة مرورك الجديدة.',
    setupCodeInvalid: 'رمز التفعيل غير صالح',
    setupCodeAlreadyRedeemed: 'تم استعمال رمز التفعيل هذا من قبل',
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

/** Fill the invite form with a username (role defaults to the only invitable role) and submit. */
export async function submitInvite(win: Page, username: string, loc: Locale): Promise<void> {
  await win.locator('input[name="username"]').fill(username);
  await win.getByRole('button', { name: T[loc].formSubmit }).click();
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

/** Fill and submit the redeem (activate account) form. */
export async function submitRedeem(
  win: Page,
  input: { username: string; setupCode: string; newPassword: string },
  loc: Locale,
): Promise<void> {
  await win.locator('input[name="username"]').fill(input.username);
  await win.locator('input[name="setupCode"]').fill(input.setupCode);
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

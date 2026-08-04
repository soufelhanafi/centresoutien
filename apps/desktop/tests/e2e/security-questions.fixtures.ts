import { _electron as electron, expect, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir, type Launched, type Locale } from './wizard.fixtures';

/**
 * SOU-155 — Security questions fallback for password reset. Black-box
 * fixtures, driven only through the running UI and the public preload bridge
 * (`window.api.invoke`). No renderer/domain/data implementation is imported.
 *
 * As of this branch, the app exposes security questions in two places only:
 *   1. Settings → "Questions de sécurité" / "أسئلة الأمان" — a real UI form
 *      where the admin sets the three question/answer pairs.
 *   2. The `auth.resetWithSecurityQuestions` IPC channel — callable through
 *      the bridge, but with NO renderer screen wired to it yet (no
 *      "forgot password" link on the login screen, no verification screen
 *      anywhere in `apps/desktop/src/renderer`). The reset-verification
 *      side of this feature is therefore exercised via the bridge only,
 *      mirroring how SOU-27's lockout scenario drives `auth.login` directly.
 */

export { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir };
export type { Launched, Locale };

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

/** User-facing copy the specs assert on, mirrored from i18n fr/ar.json (`settings.securityQuestions.*`). */
export const SECQ: Record<
  Locale,
  {
    navLabel: string;
    tabLabel: string;
    title: string;
    subtitle: string;
    answerHint: string;
    questionLabel: (position: 1 | 2 | 3) => string;
    answerLabel: (position: 1 | 2 | 3) => string;
    submit: string;
    success: string;
    logout: string;
    questions: Record<'first-employer' | 'childhood-street' | 'first-car', string>;
  }
> = {
  fr: {
    navLabel: 'Paramètres',
    tabLabel: 'Questions de sécurité',
    title: 'Questions de sécurité',
    subtitle:
      'Dernier recours pour réinitialiser le mot de passe sans code de récupération ni connexion internet.',
    answerHint: 'Les réponses ne sont pas sensibles à la casse ni aux espaces superflus.',
    questionLabel: (position) => `Question ${position}`,
    answerLabel: (position) => `Réponse ${position}`,
    submit: 'Enregistrer',
    success: 'Questions de sécurité enregistrées',
    logout: 'Se déconnecter',
    questions: {
      'first-employer': 'Quel a été le nom de votre premier employeur ?',
      'childhood-street': 'Dans quelle rue avez-vous grandi ?',
      'first-car': 'Quelle était la marque de votre première voiture ?',
    },
  },
  ar: {
    navLabel: 'الإعدادات',
    tabLabel: 'أسئلة الأمان',
    title: 'أسئلة الأمان',
    subtitle: 'الملاذ الأخير لإعادة تعيين كلمة المرور دون رمز استرجاع أو اتصال بالإنترنت.',
    answerHint: 'الإجابات غير حساسة لحالة الأحرف أو المسافات الزائدة.',
    questionLabel: (position) => `السؤال ${position}`,
    answerLabel: (position) => `الإجابة ${position}`,
    submit: 'حفظ',
    success: 'تم حفظ أسئلة الأمان',
    logout: 'تسجيل الخروج',
    questions: {
      'first-employer': 'ما اسم أول جهة عملت بها؟',
      'childhood-street': 'في أي شارع نشأت؟',
      'first-car': 'ما ماركة أول سيارة امتلكتها؟',
    },
  },
};

/**
 * The three question/answer pairs used throughout this suite. Matches the
 * form's default preselection (the bank's first three keys, in order), so
 * the happy-path scenario never has to touch the question dropdowns — the
 * defaults are asserted against {@link SECQ}'s `questions` map before any
 * answer is typed, so a change in the bank's default order fails loudly
 * instead of silently answering the wrong questions.
 */
export const DEFAULT_ANSWERS = {
  'first-employer': 'Acme Corp',
  'childhood-street': 'Rue Hassan II',
  'first-car': 'Renault',
} as const;

export type SecurityQuestionKey = keyof typeof DEFAULT_ANSWERS;

/** Launch a fresh app, seed the admin, and authenticate (remember-device ON). */
export async function launchAuthenticated(dir: string, locale: Locale): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env: { ...process.env, CS_LOCALE: locale },
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

/** Navigate to Settings → "Questions de sécurité" / "أسئلة الأمان". */
export async function gotoSecurityQuestionsTab(win: Page, loc: Locale): Promise<void> {
  const L = SECQ[loc];
  const navLink = win.getByRole('link', { name: L.navLabel });
  if (await navLink.count()) {
    await navLink.click();
  }
  await win.getByRole('tab', { name: L.tabLabel }).click();
  // The card title isn't rendered with a heading role (plain styled text, not
  // an <h1-6>), so this waits on visible text rather than getByRole('heading').
  await win.getByText(L.title, { exact: true }).first().waitFor({ state: 'visible' });
}

/**
 * Fill the three answers on the currently-visible security-questions form,
 * asserting the default question preselection matches the expected bank
 * keys/order first (see {@link DEFAULT_ANSWERS}).
 */
export async function fillDefaultSecurityAnswers(win: Page, loc: Locale): Promise<void> {
  const L = SECQ[loc];
  const keys = Object.keys(DEFAULT_ANSWERS) as SecurityQuestionKey[];
  for (const [index, key] of keys.entries()) {
    const position = (index + 1) as 1 | 2 | 3;
    await expect(
      win.getByRole('combobox').nth(index),
      `default question ${position} must be "${L.questions[key]}" (bank order assumption)`,
    ).toHaveText(L.questions[key]);
    await win.getByLabel(L.answerLabel(position), { exact: true }).fill(DEFAULT_ANSWERS[key]);
  }
}

/** Submit the security-questions setup form and wait for the success message. */
export async function saveSecurityQuestions(win: Page, loc: Locale): Promise<void> {
  const L = SECQ[loc];
  await win.getByRole('button', { name: L.submit }).click();
  await win.getByText(L.success).waitFor({ state: 'visible' });
}

export type SecurityAnswerInput = { questionKey: string; answer: string };

export type SecurityResetOutcome =
  | { outcome: 'confirmation-required' }
  | { outcome: 'invalid-answer'; remainingAttempts: number }
  | { outcome: 'locked-out'; lockedUntilMs: number };

/** Invoke the security-questions reset path through the public bridge (no UI screen exists for it yet). */
export async function bridgeResetWithSecurityQuestions(
  win: Page,
  answers: readonly SecurityAnswerInput[],
): Promise<SecurityResetOutcome> {
  return win.evaluate(async (req) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<SecurityResetOutcome> };
    }).api;
    return api.invoke('auth.resetWithSecurityQuestions', req);
  }, { answers }) as Promise<SecurityResetOutcome>;
}

/** The correct answers, exactly as saved. */
export const CORRECT_ANSWERS: readonly SecurityAnswerInput[] = (
  Object.keys(DEFAULT_ANSWERS) as SecurityQuestionKey[]
).map((questionKey) => ({ questionKey, answer: DEFAULT_ANSWERS[questionKey] }));

/** The correct answers with case/whitespace noise — proves trim/lowercase normalization. */
export const CORRECT_ANSWERS_NOISY: readonly SecurityAnswerInput[] = [
  { questionKey: 'first-employer', answer: '  acme CORP  ' },
  { questionKey: 'childhood-street', answer: 'rue hassan ii' },
  { questionKey: 'first-car', answer: '  RENAULT' },
];

/** Deliberately wrong answers for the throttle scenarios. */
export const WRONG_ANSWERS: readonly SecurityAnswerInput[] = (
  Object.keys(DEFAULT_ANSWERS) as SecurityQuestionKey[]
).map((questionKey) => ({ questionKey, answer: 'WRONG-ANSWER' }));

/** Bridge check: has the admin configured security questions? */
export async function securityQuestionsExist(win: Page): Promise<boolean> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ exists: boolean }> };
    }).api;
    const res = await api.invoke('admin.securityQuestions.exists', {});
    return res.exists;
  });
}

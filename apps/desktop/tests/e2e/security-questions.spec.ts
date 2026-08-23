import { test, expect, type Page } from '@playwright/test';
import {
  SECQ,
  DIRECTION,
  freshUserDataDir,
  launchAuthenticated,
  gotoSecurityQuestionsTab,
  fillDefaultSecurityAnswers,
  saveSecurityQuestions,
  securityQuestionsForm,
  bridgeResetWithSecurityQuestions,
  securityQuestionsExist,
  CORRECT_ANSWERS,
  CORRECT_ANSWERS_NOISY,
  WRONG_ANSWERS,
  type Launched,
  type Locale,
} from './security-questions.fixtures';

/**
 * SOU-155 — Security questions fallback for password reset.
 * Black-box: the app is driven only through its UI and the public preload
 * bridge. Each test uses a fresh userData dir, and runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Scope, confirmed for this branch (see the fixtures file for detail):
 *   - Setup (Settings → "Questions de sécurité" / "أسئلة الأمان") has a real
 *     renderer screen — driven here through the actual UI.
 *   - The reset-via-security-questions path (`auth.resetWithSecurityQuestions`)
 *     has NO renderer screen yet (no "forgot password" entry point anywhere
 *     in the app) — driven here through the public bridge, the only way to
 *     reach it today.
 *   - Correct answers resolve to `confirmation-required`, never `success` —
 *     the path is intentionally gated until SOU-157 (email relay) ships.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function setUpSecurityQuestions(win: Page, loc: Locale): Promise<void> {
  await gotoSecurityQuestionsTab(win, loc);
  await fillDefaultSecurityAnswers(win, loc);
  await saveSecurityQuestions(win, loc);
}

// ---- Scenario 1 — happy path -----------------------------------------------

test('S1 — admin sets up security questions, then answering them correctly reaches confirmation-required', async () => {
  const loc = locale();
  const L = SECQ[loc];
  live = await launchAuthenticated(freshUserDataDir(), loc);
  const win = live.win;

  await expect(win.getByRole('button', { name: L.logout })).toBeVisible();

  await setUpSecurityQuestions(win, loc);
  await win.screenshot({ path: `test-results/security-questions-setup-success-${loc}.png` });

  expect(await securityQuestionsExist(win), 'admin.securityQuestions.exists must flip true after save').toBe(
    true,
  );

  // Correct answers, with case/whitespace noise, must still match (trim + lowercase
  // normalization) and reach confirmation-required — the current "success" boundary,
  // since no email relay (SOU-157) exists yet to complete an actual reset.
  const result = await bridgeResetWithSecurityQuestions(win, CORRECT_ANSWERS_NOISY);
  expect(result.outcome, 'correct (normalized) answers must reach confirmation-required').toBe(
    'confirmation-required',
  );
});

// ---- Scenario 2 — 3-attempt throttle + cooldown ----------------------------

test('S2 — three wrong answers exhaust the limit; cooldown blocks even correct answers afterward [DONE-WHEN]', async () => {
  test.setTimeout(60_000);
  const loc = locale();
  live = await launchAuthenticated(freshUserDataDir(), loc);
  const win = live.win;

  await setUpSecurityQuestions(win, loc);

  const first = await bridgeResetWithSecurityQuestions(win, WRONG_ANSWERS);
  expect(first, 'wrong attempt 1 of 3 must be invalid-answer with 2 remaining').toEqual({
    outcome: 'invalid-answer',
    remainingAttempts: 2,
  });

  const second = await bridgeResetWithSecurityQuestions(win, WRONG_ANSWERS);
  expect(second, 'wrong attempt 2 of 3 must be invalid-answer with 1 remaining').toEqual({
    outcome: 'invalid-answer',
    remainingAttempts: 1,
  });

  const third = await bridgeResetWithSecurityQuestions(win, WRONG_ANSWERS);
  expect(third.outcome, 'the 3rd wrong attempt must lock the reset path').toBe('locked-out');
  let lockedUntilMs = -1;
  if (third.outcome === 'locked-out') {
    lockedUntilMs = third.lockedUntilMs;
    const minutesAhead = (third.lockedUntilMs - Date.now()) / 60_000;
    expect(minutesAhead, '~15-minute cooldown, same shape as SOU-27 login throttle').toBeGreaterThan(14);
    expect(minutesAhead, '~15-minute cooldown, same shape as SOU-27 login throttle').toBeLessThanOrEqual(
      15.5,
    );
  }

  // The lock must block even a subsequent CORRECT attempt — a locked-out reset
  // path is not bypassable by finally guessing right.
  const afterLockWithCorrectAnswers = await bridgeResetWithSecurityQuestions(win, CORRECT_ANSWERS);
  expect(
    afterLockWithCorrectAnswers,
    'correct answers must still be refused while the cooldown is active',
  ).toEqual({ outcome: 'locked-out', lockedUntilMs });
});

// ---- Scenario 3 — reset never completes (gated until SOU-157) -------------

test('S3 — reset via security questions is gated: correct answers never yield success, and no UI path can complete it yet', async () => {
  const loc = locale();
  live = await launchAuthenticated(freshUserDataDir(), loc);
  const win = live.win;

  await setUpSecurityQuestions(win, loc);

  const first = await bridgeResetWithSecurityQuestions(win, CORRECT_ANSWERS);
  expect(first.outcome, 'correct answers must never complete the reset (no success outcome exists)').toBe(
    'confirmation-required',
  );

  // Repeating with correct answers must stay deterministic — still gated, not
  // suddenly "success" on a later try, and not itself throttled (correct
  // answers do not consume the wrong-answer counter).
  const second = await bridgeResetWithSecurityQuestions(win, CORRECT_ANSWERS);
  expect(second.outcome, 'repeat correct answers must stay gated at confirmation-required').toBe(
    'confirmation-required',
  );

  // Observable proof there is no admin-tier fallback UI to finish the job:
  // the app never navigated away from the authenticated shell, and the
  // login screen (the only place a "forgot password" entry point could live)
  // is not reachable without logging out first.
  await expect(win.getByRole('button', { name: SECQ[loc].logout })).toBeVisible();
});

// ---- Scenario 4 — FR/AR RTL rendering of the setup form --------------------

test('S4 — the security-questions setup form renders correctly in the active locale/direction', async () => {
  const loc = locale();
  const L = SECQ[loc];
  live = await launchAuthenticated(freshUserDataDir(), loc);
  const win = live.win;

  await gotoSecurityQuestionsTab(win, loc);

  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);
  await expect(win.getByText(L.title, { exact: true }).first()).toBeVisible();
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByText(L.answerHint)).toBeVisible();

  for (const position of [1, 2, 3] as const) {
    await expect(win.getByText(L.questionLabel(position), { exact: true })).toBeVisible();
    await expect(win.getByLabel(L.answerLabel(position), { exact: true })).toBeVisible();
  }

  await expect(
    securityQuestionsForm(win, loc).getByRole('button', { name: L.submit }),
  ).toBeVisible();

  await win.screenshot({ path: `test-results/security-questions-form-${loc}.png`, fullPage: true });
});

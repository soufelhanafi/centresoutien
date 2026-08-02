import { test, expect, type Page } from '@playwright/test';
import { STR, boot, seed, gotoGroups, openGroupDetail, type Launched, type Locale } from './enrollment.fixtures';

/**
 * SOU-51 — Group ↔ Student enrollment UI (black-box, both fr-LTR and ar-RTL).
 *
 * Critical-only per SOU-142: kept scenarios are the happy path plus the two
 * hard cross-kind/capacity invariants (`CrossKindEnrollmentError`, proactive
 * group-full capacity) — both explicit domain rules that must never regress.
 * Roster empty state, picker contents/exclusion, unenroll, and the
 * duplicate-enrollment/subscription-missing guards are lower blast-radius and
 * better proven at the domain/integration level against the enrollment use
 * case directly.
 */

const locale = () => test.info().project.name as Locale;
const isAr = () => locale() === 'ar';

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** EXACT text match — `getByText(string)` is case-insensitive substring by default
 *  (e.g. the success toast "Élève inscrit" is a substring of "Aucun élève inscrit"). */
const exact = (win: Page, text: string) => win.getByText(text, { exact: true });

async function openAddDialog(win: Page, L: (typeof STR)[Locale]) {
  if (await win.getByRole('dialog').isVisible().catch(() => false)) {
    await win.keyboard.press('Escape');
    await win.waitForTimeout(200);
  }
  await win.getByRole('button', { name: L.roster.add }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Open the dialog, select the candidate by (localized) name, confirm. */
async function enrollViaUi(win: Page, L: (typeof STR)[Locale], name: { fr: string; ar: string }) {
  const dialog = await openAddDialog(win, L);
  await dialog.getByRole('combobox').first().click();
  await win.waitForTimeout(200);
  await win.getByRole('option').filter({ hasText: isAr() ? name.ar : name.fr }).first().click();
  await win.waitForTimeout(150);
  await dialog.getByRole('button', { name: L.roster.addConfirm }).click();
  await win.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// ACCEPTANCE — happy path
// ---------------------------------------------------------------------------

test('HAPPY PATH: enrolling a valid student shows success and adds them to the roster', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const name = { fr: 'Réussite Élève', ar: 'طالب ناجح' };
  await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-HAPPY',
    students: [{ fr: name.fr, ar: name.ar, sub: { kind: 'regular', covers: 'subject' } }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-HAPPY');
  await enrollViaUi(win, L, name);
  await win.screenshot({ path: `test-results/sou51-happy-${locale()}.png` });
  await expect(exact(win, L.roster.addSuccess)).toBeVisible();
  await expect(win.getByText(isAr() ? name.ar : name.fr).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// ACCEPTANCE — each hard guard shows its OWN specific localized message
// ---------------------------------------------------------------------------

test('GUARD group-full: capacity is enforced proactively — add disabled + "Complet" indicator', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const filler = { fr: 'Rempli Un', ar: 'ملأ واحد' };
  const extra = { fr: 'Trop Tard', ar: 'متأخر' };
  await seed(win, {
    groupKind: 'regular',
    capacity: 1,
    groupLevel: 'QA-FULL',
    students: [
      { fr: filler.fr, ar: filler.ar, sub: { kind: 'regular', covers: 'subject' } },
      { fr: extra.fr, ar: extra.ar, sub: { kind: 'regular', covers: 'subject' } },
    ],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-FULL');
  await enrollViaUi(win, L, filler); // fills the single seat
  // The roster panel disables "add" once the seat count reaches capacity and shows
  // the localized "Complet" indicator — capacity is prevented at the button, so the
  // over-capacity domain guard is never reached through the UI (it stays as
  // defense-in-depth, proven at the domain policy level).
  await win.screenshot({ path: `test-results/sou51-group-full-${locale()}.png` });
  await expect(win.getByRole('button', { name: L.roster.add })).toBeDisabled();
  await expect(exact(win, isAr() ? 'المجموعة مكتملة.' : 'Le groupe est complet.')).toBeVisible();
  await expect(exact(win, L.roster.addError)).toHaveCount(0);
});

test('GUARD cross-kind: shows the cross-track message (not the generic toast)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const name = { fr: 'Mauvais Type', ar: 'نوع خاطئ' };
  // Group opened is regular; give the student an exam-prep subscription -> cross-kind.
  await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-CROSS',
    students: [{ fr: name.fr, ar: name.ar, sub: { kind: 'exam-prep', covers: 'subject' } }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-CROSS');
  await enrollViaUi(win, L, name);
  await win.screenshot({ path: `test-results/sou51-cross-kind-${locale()}.png` });
  await expect(exact(win, L.guard.crossKind)).toBeVisible();
  await expect(exact(win, L.roster.addError)).toHaveCount(0);
});

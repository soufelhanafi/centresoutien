import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  boot,
  seed,
  enrollViaApi,
  gotoGroups,
  openGroupDetail,
  pageCrashed,
  type Launched,
  type Locale,
} from './enrollment.fixtures';

/**
 * SOU-51 — Group ↔ Student enrollment UI (black-box, both fr-LTR and ar-RTL).
 *
 * Drives the running app as a user would: open a group from the Groups list, open
 * the "add student" dialog, enroll/unenroll. Asserts on the user-facing copy
 * mirrored from `i18n/{fr,ar}.json`. Groups are seeded through the public IPC
 * channels (group create/edit UI still uses a mock), but the list, detail, roster
 * and enrollment all run on the REAL read models / channels.
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
// Surface checks
// ---------------------------------------------------------------------------

test('roster empty state renders on a fresh group', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await seed(win, { groupKind: 'regular', capacity: 5, groupLevel: 'QA-EMPTY', students: [] });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-EMPTY');
  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.roster.emptyTitle).first()).toBeVisible();
});

test('add-student picker lists real DB students as "name — level"', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const a = { fr: 'Étudiant Alpha', ar: 'الطالب ألفا' };
  await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-PICK',
    students: [{ fr: a.fr, ar: a.ar, sub: { kind: 'regular', covers: 'subject' } }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-PICK');
  const dialog = await openAddDialog(win, L);
  await dialog.getByRole('combobox').first().click();
  await win.waitForTimeout(200);
  await expect(win.getByRole('option').filter({ hasText: isAr() ? a.ar : a.fr }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// ACCEPTANCE — happy path, unenroll, picker exclusion
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

test('UNENROLL: removing an enrolled student clears them from the roster', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const name = { fr: 'À Retirer', ar: 'للإزالة' };
  await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-UNENROLL',
    students: [{ fr: name.fr, ar: name.ar, sub: { kind: 'regular', covers: 'subject' } }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-UNENROLL');
  await enrollViaUi(win, L, name);
  await expect(win.getByText(isAr() ? name.ar : name.fr).first()).toBeVisible();

  await win.getByRole('button', { name: L.roster.remove }).first().click();
  await win.waitForTimeout(300);
  // A confirmation dialog may guard the removal; confirm it if present.
  const confirm = win.getByRole('alertdialog').getByRole('button', { name: L.roster.remove });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await win.waitForTimeout(600);
  await win.screenshot({ path: `test-results/sou51-unenroll-${locale()}.png` });
  await expect(exact(win, L.roster.removeSuccess)).toBeVisible();
  await expect(win.getByText(L.roster.emptyTitle).first()).toBeVisible();
});

test('PICKER excludes an already-enrolled student', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const enrolled = { fr: 'Déjà Là', ar: 'موجود' };
  const free = { fr: 'Encore Libre', ar: 'حر' };
  const s = await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-EXCL',
    students: [
      { fr: enrolled.fr, ar: enrolled.ar, sub: { kind: 'regular', covers: 'subject' } },
      { fr: free.fr, ar: free.ar, sub: { kind: 'regular', covers: 'subject' } },
    ],
  });
  // Enroll the first student through the real channel, then open the picker.
  await enrollViaApi(win, s.students[0]!.id, s.groupId);
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-EXCL');
  const dialog = await openAddDialog(win, L);
  await dialog.getByRole('combobox').first().click();
  await win.waitForTimeout(200);
  // The free student is offered; the enrolled one is not.
  await expect(win.getByRole('option').filter({ hasText: isAr() ? free.ar : free.fr }).first()).toBeVisible();
  await expect(win.getByRole('option').filter({ hasText: isAr() ? enrolled.ar : enrolled.fr })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// ACCEPTANCE — each guard shows its OWN specific localized message (key proof)
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
  // defense-in-depth, proven at the IPC contract level in enrollment-contract.spec).
  await win.screenshot({ path: `test-results/sou51-group-full-${locale()}.png` });
  await expect(win.getByRole('button', { name: L.roster.add })).toBeDisabled();
  await expect(exact(win, isAr() ? 'المجموعة مكتملة.' : 'Le groupe est complet.')).toBeVisible();
  await expect(exact(win, L.roster.addError)).toHaveCount(0);
});

test('GUARD duplicate-enrollment: shows the "déjà inscrit" message (not the generic toast)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const name = { fr: 'Deux Fois', ar: 'مرتين' };
  const s = await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-DUP',
    students: [{ fr: name.fr, ar: name.ar, sub: { kind: 'regular', covers: 'subject' } }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-DUP');
  // Realistic race the guard defends: pick the student in the dialog, but the same
  // student becomes live-enrolled (another device / a stale picker) before confirm.
  const dialog = await openAddDialog(win, L);
  await dialog.getByRole('combobox').first().click();
  await win.waitForTimeout(200);
  await win.getByRole('option').filter({ hasText: isAr() ? name.ar : name.fr }).first().click();
  await enrollViaApi(win, s.students[0]!.id, s.groupId);
  await dialog.getByRole('button', { name: L.roster.addConfirm }).click();
  await win.waitForTimeout(800);
  await win.screenshot({ path: `test-results/sou51-duplicate-${locale()}.png` });
  await expect(exact(win, L.guard.duplicate)).toBeVisible();
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

test('GUARD subscription-missing: shows the "aucun abonnement actif" message (not the generic toast)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const name = { fr: 'Sans Abo', ar: 'بدون اشتراك' };
  await seed(win, {
    groupKind: 'regular',
    capacity: 5,
    groupLevel: 'QA-NOSUB',
    students: [{ fr: name.fr, ar: name.ar, sub: null }],
  });
  await gotoGroups(win, L);
  await openGroupDetail(win, L, 'QA-NOSUB');
  await enrollViaUi(win, L, name);
  await win.screenshot({ path: `test-results/sou51-sub-missing-${locale()}.png` });
  await expect(exact(win, L.guard.subscriptionMissing)).toBeVisible();
  await expect(exact(win, L.roster.addError)).toHaveCount(0);
});

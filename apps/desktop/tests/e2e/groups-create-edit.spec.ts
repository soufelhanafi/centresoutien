import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoGroups, type Launched, type Locale } from './groups.fixtures';

/**
 * SOU-50 — Group CRUD UI · CREATE + EDIT metadata.
 *
 * Runs under both `fr` (LTR) and `ar` (RTL) projects. The create/edit form's
 * subject/room dropdowns are populated by the real `subject.list` / `room.list`
 * channels (SOU-124), seeded through the public bridge in `boot()`.
 *
 * REGRESSION GUARD (see "create succeeds" / "edit saves"): with a subject and a
 * room selected from the form's OWN dropdowns, submit must be accepted — the
 * dialog closes, success feedback appears, and the row is created/updated.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const SUBJECTS = [
  { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' },
  { nameFr: 'Physique-Chimie', nameAr: 'الفيزياء والكيمياء', code: 'PHYS' },
];
const ROOMS = [
  { name: 'Salle 1', capacity: 30 },
  { name: 'Salle 2', capacity: 30 },
];

async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Fill the create form with a subject + room chosen from the form's own lists. */
async function fillValidGroup(win: Page, dialog: ReturnType<Page['getByRole']>, L: (typeof STR)[Locale], level: string) {
  await dialog.getByRole('combobox', { name: L.form.subject }).click();
  await win.getByRole('option').first().click();
  await dialog.getByRole('combobox', { name: L.form.room }).click();
  await win.getByRole('option').first().click();
  await dialog.getByLabel(L.form.level, { exact: false }).fill(level);
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('15');
}

// ---------------------------------------------------------------------------
// Validation — empty submit surfaces inline, translated errors and keeps the
// dialog open. (PASS — validation works.)
// ---------------------------------------------------------------------------
test('Create form rejects an empty submit with inline errors', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: SUBJECTS, rooms: ROOMS });
  const win = live.win;
  await gotoGroups(win, L);

  const dialog = await openCreate(win, L);
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(dialog.getByText(L.errors.required)).toBeVisible(); // level
  await expect(dialog.getByText(L.errors.notInteger)).toBeVisible(); // capacity
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: `test-results/groups-create-validation-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Validation — capacity below 1 is rejected. (Analogue of the "no zero/negative
// numeric" rule.) PASS expected.
// ---------------------------------------------------------------------------
test('Create form rejects capacity below 1', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: SUBJECTS, rooms: ROOMS });
  const win = live.win;
  await gotoGroups(win, L);

  const dialog = await openCreate(win, L);
  await dialog.getByLabel(L.form.level, { exact: false }).fill('Test');
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('0');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(dialog.getByText(L.errors.capacityTooSmall)).toBeVisible();
  await expect(dialog).toBeVisible();
});

// ---------------------------------------------------------------------------
// Happy path — a fully valid group can be created. The subject/room IDs from the
// form's own dropdowns must be accepted (real ULIDs from `subject.create` /
// `room.create`).
// ---------------------------------------------------------------------------
test('Create succeeds with a valid group (success feedback + row appears)', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: SUBJECTS, rooms: ROOMS });
  const win = live.win;
  await gotoGroups(win, L);

  const dialog = await openCreate(win, L);
  await fillValidGroup(win, dialog, L, 'ZZ-CREATED');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(
    dialog.getByText(L.errors.invalidId),
    'subject/room selected from the form must not be rejected as "Identifiant invalide"',
  ).toHaveCount(0);
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByRole('row', { name: /ZZ-CREATED/ })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Edit metadata — change level/capacity on an existing group and save. Save must
// be accepted: the seeded group's subject/room ids are real ULIDs.
// ---------------------------------------------------------------------------
test('Edit metadata saves and re-renders', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    subjects: SUBJECTS,
    rooms: ROOMS,
    groups: [{ subjectIdx: 0, roomIdx: 0, level: '1 Bac SE', capacity: 15 }],
  });
  const win = live.win;
  await gotoGroups(win, L);

  const row = win.getByRole('row', { name: /1 Bac SE/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.level, { exact: false }).fill('1 Bac SE-EDITED');
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('9');
  await dialog.getByRole('button', { name: L.form.save }).click();

  await expect(dialog.getByText(L.errors.invalidId)).toHaveCount(0);
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();
  await expect(win.getByRole('row', { name: /1 Bac SE-EDITED/ })).toBeVisible();
});

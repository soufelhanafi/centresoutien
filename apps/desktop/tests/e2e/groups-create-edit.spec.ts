import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoGroups, type Launched, type Locale } from './groups.fixtures';

/**
 * SOU-50 — Group CRUD UI · CREATE.
 *
 * Critical-only per SOU-142: kept scenario is the canonical top-level
 * "create a group" flow. Empty-submit/capacity validation and edit-metadata
 * are lower blast-radius UI behavior — unit/component test the form schema
 * instead. Runs under both `fr` (LTR) and `ar` (RTL) projects. The create
 * form's subject dropdown is populated by the real `subject.list` channel
 * (SOU-124), seeded through the public bridge in `boot()`. A group carries no
 * room — rooms attach at session creation (SOU-176).
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

async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Fill the create form with a subject chosen from the form's own list. */
async function fillValidGroup(win: Page, dialog: ReturnType<Page['getByRole']>, L: (typeof STR)[Locale], level: string) {
  await dialog.getByRole('combobox', { name: L.form.subject }).click();
  await win.getByRole('option').first().click();
  await dialog.getByLabel(L.form.level, { exact: false }).fill(level);
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('15');
}

// ---------------------------------------------------------------------------
// Happy path — a fully valid group can be created. The subject ID from the
// form's own dropdown must be accepted (a real ULID from `subject.create`).
// ---------------------------------------------------------------------------
test('Create succeeds with a valid group (success feedback + row appears)', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: SUBJECTS });
  const win = live.win;
  await gotoGroups(win, L);

  const dialog = await openCreate(win, L);
  await fillValidGroup(win, dialog, L, 'ZZ-CREATED');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(
    dialog.getByText(L.errors.invalidId),
    'subject selected from the form must not be rejected as "Identifiant invalide"',
  ).toHaveCount(0);
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByRole('row', { name: /ZZ-CREATED/ })).toBeVisible();
});

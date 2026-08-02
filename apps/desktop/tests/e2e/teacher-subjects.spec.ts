import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoTeachers, pageCrashed, subjectName, type Launched, type Locale, type CreatedSubject } from './teacher-subjects.fixtures';

/**
 * SOU-124 (frontend half) — teacher ↔ subject wiring. Black-box, driven only
 * through the running packaged app. Runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenario is create-with-subject-multi-select
 * (the canonical top-level flow — also proves the assigned subjects persist
 * and resolve to names on the detail tab). Subject filtering, detail-tab
 * resolution in isolation, edit, empty states, and RTL are lower blast-radius
 * and better covered at the unit/component level.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: CreatedSubject[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' };
const PHYS = { nameFr: 'Physique', nameAr: 'الفيزياء', code: 'PHYS' };

async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Teachers page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

/** Open the create dialog, fill identity, toggle the given subject checkboxes, submit. */
async function createTeacher(
  win: Page,
  L: (typeof STR)[Locale],
  t: { nameFr: string; nameAr: string; phone: string; subjects?: readonly string[] },
): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill(t.nameFr);
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill(t.nameAr);
  await dialog.getByLabel(L.form.phone, { exact: false }).first().fill(t.phone);
  for (const s of t.subjects ?? []) {
    await dialog.getByRole('checkbox', { name: s, exact: true }).click();
  }
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** From the list, open a teacher's detail page via the name link. */
async function openDetail(win: Page, name: RegExp): Promise<void> {
  await win.getByRole('row', { name }).getByRole('link', { name }).first().click();
}

// ---------------------------------------------------------------------------
// Scenario 3 — create a teacher via the form's subject multi-select; the row
// reflects the subject count, and the phone is normalized to E.164.
// ---------------------------------------------------------------------------
test('Scenario 3 — create a teacher choosing subjects in the multi-select', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: [MATH, PHYS] });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await createTeacher(win, L, {
    nameFr: 'Karim Idrissi',
    nameAr: 'كريم الإدريسي',
    phone: '0612345678',
    subjects: [subjectName(locale(), MATH), subjectName(locale(), PHYS)],
  });
  await win.screenshot({ path: `test-results/teacher-created-${locale()}.png` });

  const row = win.getByRole('row', { name: /Karim Idrissi/ });
  await expect(row).toBeVisible();
  // Malformed/local phone normalized to E.164 for display.
  await expect(row).toContainText('+212612345678');

  // The chosen subjects persisted: the detail Subjects tab resolves both names.
  await openDetail(win, /Karim Idrissi/);
  await win.getByRole('tab', { name: L.detail.tabs.subjects }).click();
  const panel = win.getByRole('tabpanel', { name: L.detail.tabs.subjects });
  await expect(panel.getByText(subjectName(locale(), MATH), { exact: false })).toBeVisible();
  await expect(panel.getByText(subjectName(locale(), PHYS), { exact: false })).toBeVisible();
});

import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoGroups, pageCrashed, type Launched, type Locale } from './groups.fixtures';

/**
 * SOU-50 — Group CRUD UI · LIST + FILTERS.
 *
 * Black-box, driven only through the running packaged app. Runs under both the
 * `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Seed groups (real IPC, via `boot()`): Math·Régulier·2 Bac SM (3/20), Physique-
 * Chimie·Régulier·1 Bac SE, SVT·Régulier·3AC (0/12), Math·Prépa examen·2 Bac SM,
 * Français·Régulier·1 Bac SE (archived).
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
  { nameFr: 'SVT', nameAr: 'علوم الحياة والأرض', code: 'SVT' },
  { nameFr: 'Français', nameAr: 'الفرنسية', code: 'FR' },
];
const ROOMS = [
  { name: 'Salle 1', capacity: 30 },
  { name: 'Salle 2', capacity: 30 },
  { name: 'Salle 3', capacity: 30 },
];
const TEACHERS = [
  { nameFr: 'M. Alaoui', nameAr: 'الأستاذ العلوي', phone: '+212600100001' },
  { nameFr: 'Mme Bennani', nameAr: 'الأستاذة بنّاني', phone: '+212600100002' },
];
const GROUPS = [
  { subjectIdx: 0, roomIdx: 0, teacherIdx: 0, level: '2 Bac SM', capacity: 20, kind: 'regular' as const, enrolledCount: 3 },
  { subjectIdx: 1, roomIdx: 1, teacherIdx: 1, level: '1 Bac SE', capacity: 3, kind: 'regular' as const },
  { subjectIdx: 2, roomIdx: 2, level: '3AC', capacity: 12, kind: 'regular' as const },
  { subjectIdx: 0, roomIdx: 0, teacherIdx: 0, level: '2 Bac SM', capacity: 10, kind: 'exam-prep' as const },
  { subjectIdx: 3, roomIdx: 1, teacherIdx: 1, level: '1 Bac SE', capacity: 18, kind: 'regular' as const, archived: true },
  // Every seeded subject needs at least one ACTIVE group so the subject filter's
  // dynamically-picked option (alphabetically first, by `subject.list` ordering)
  // always has a non-empty result — Français would otherwise only exist on the
  // archived group above.
  { subjectIdx: 3, roomIdx: 2, level: 'Terminale', capacity: 10, kind: 'regular' as const },
];

async function bootSeeded(locale: Locale) {
  return boot(locale, { subjects: SUBJECTS, rooms: ROOMS, teachers: TEACHERS, groups: GROUPS });
}

/** Data rows (role=row) excluding the header row. */
function dataRow(win: Page, level: RegExp) {
  return win.getByRole('row', { name: level });
}

test('List renders header, tabs, filters and the seeded groups', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);
  await win.screenshot({ path: `test-results/groups-list-${locale()}.png` });

  expect(await pageCrashed(win), 'Groups page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn }).first()).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.active })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.archived })).toBeVisible();

  // Seed rows present (matched by locale-neutral level strings).
  await expect(dataRow(win, /1 Bac SE/)).toBeVisible();
  await expect(dataRow(win, /3AC/)).toBeVisible();
  await expect(win.getByRole('row', { name: /2 Bac SM/ }).first()).toBeVisible();

  // Both kind badges are shown (regular + exam-prep are visually separable).
  await expect(win.getByText(L.kind.regular).first()).toBeVisible();
  await expect(win.getByText(L.kind.examPrep).first()).toBeVisible();

  // Fill badge renders as an "enrolled / capacity" fraction.
  await expect(win.getByText('3 / 20').first()).toBeVisible();
  await expect(win.getByText('0 / 12').first()).toBeVisible();
});

test('Kind filter narrows the list to exam-prep only', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);

  await win.getByRole('combobox', { name: L.filters.kindLabel }).click();
  await win.getByRole('option', { name: L.kind.examPrep }).click();
  await win.waitForTimeout(300);

  // Regular Physique (1 Bac SE) is gone; the exam-prep badge remains.
  await expect(dataRow(win, /1 Bac SE/)).toHaveCount(0);
  await expect(win.getByText(L.kind.examPrep).first()).toBeVisible();
  await win.screenshot({ path: `test-results/groups-filter-kind-${locale()}.png` });
});

test('Subject filter keeps only rows of the chosen subject', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);

  const combo = win.getByRole('combobox', { name: L.filters.subjectLabel });
  await combo.click();
  // Pick the second option (first real subject after the "all" option) and read
  // its label at runtime so the assertion is locale-neutral.
  const chosen = win.getByRole('option').nth(1);
  const chosenLabel = (await chosen.innerText()).trim();
  await chosen.click();
  await win.waitForTimeout(300);

  const rows = win.getByRole('row');
  const total = await rows.count(); // includes header
  expect(total).toBeGreaterThan(1);
  // Every visible data row must reference the chosen subject.
  for (let i = 1; i < total; i++) {
    await expect(rows.nth(i)).toContainText(chosenLabel);
  }
});

test('Level search filters by level and shows the no-results state', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);

  const search = win.getByPlaceholder(L.filters.levelLabel);
  await search.fill('1 Bac SE');
  await win.waitForTimeout(300);
  await expect(dataRow(win, /1 Bac SE/)).toBeVisible();
  await expect(dataRow(win, /3AC/)).toHaveCount(0);

  await search.fill('zzz-no-such-level');
  await win.waitForTimeout(300);
  await expect(win.getByText(L.noResults.title)).toBeVisible();
  await win.screenshot({ path: `test-results/groups-no-results-${locale()}.png` });
});

test('Archived tab renders archived groups with a restore action', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);

  await win.getByRole('tab', { name: L.tabs.archived }).click();
  await expect(win.getByRole('row', { name: /Français/ })).toBeVisible();
  await expect(win.getByRole('button', { name: L.row.restore }).first()).toBeVisible();
  await expect(win.getByText(L.archivedEmpty.title)).toHaveCount(0);
  await win.screenshot({ path: `test-results/groups-archived-tab-${locale()}.png` });
});

test('Locale direction and RTL header mirroring', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoGroups(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  const heading = win.getByRole('heading', { level: 1, name: L.title });
  const newBtn = win.getByRole('button', { name: L.newBtn }).first();
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(bBox.x, 'new-group button mirrors to the start (left) in RTL').toBeLessThan(hBox.x);
  } else {
    expect(bBox.x).toBeGreaterThan(hBox.x);
  }
  await win.screenshot({ path: `test-results/groups-direction-${locale()}.png` });
});

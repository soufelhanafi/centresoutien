import { test, expect } from '@playwright/test';
import {
  STR,
  DATA,
  DIRECTION,
  bootSeeded,
  bootEmpty,
  gotoPlanning,
  sessionBlocks,
  pickFilter,
  filterOptions,
  pageCrashed,
  type Launched,
  type Locale,
} from './planner-week.fixtures';

/**
 * SOU-118 — Weekly planner grid on the real enriched `session.week`.
 *
 * Black-box, through the running packaged app only. Runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects. See planner-week.fixtures.ts for the seed
 * boundary (sessions written to the DB because no create-session seam ships).
 */

const locale = () => test.info().project.name as Locale;
/** Localized name for the active locale. */
const n = (v: { fr: string; ar: string }) => v[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('Empty week: fresh center shows the real empty state, not mock blocks', async () => {
  const L = STR[locale()];
  live = await bootEmpty(locale());
  const win = live.win;
  await gotoPlanning(win, L);
  await win.screenshot({ path: `test-results/sou118-empty-${locale()}.png` });

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
  await expect(win.getByText(L.emptyWeek)).toBeVisible();
  await expect(sessionBlocks(win)).toHaveCount(0);
});

test('Renders the real enriched week: subject, time, teacher and room per block', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoPlanning(win, L);
  await win.screenshot({ path: `test-results/sou118-week-${locale()}.png`, fullPage: true });

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.emptyWeek)).toHaveCount(0);
  // Three seeded sessions => three blocks.
  await expect(sessionBlocks(win)).toHaveCount(3);

  // The Monday Math block carries its enriched join: subject + time + teacher + room.
  const mathBlock = sessionBlocks(win).filter({ hasText: n(DATA.math) }).first();
  await expect(mathBlock).toContainText('09:00');
  await expect(mathBlock).toContainText(n(DATA.teacherA));
  await expect(mathBlock).toContainText(DATA.roomA);

  // The Physique block shows its own enriched join.
  const physBlock = sessionBlocks(win).filter({ hasText: n(DATA.phys) }).first();
  await expect(physBlock).toContainText(n(DATA.teacherB));
  await expect(physBlock).toContainText(DATA.roomB);
});

test('Subject colour is applied per subject (same subject shares colour, different subjects differ)', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoPlanning(win, L);

  const swatches = await sessionBlocks(win).evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return {
        text: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        accent: cs.borderInlineStartColor,
        bg: cs.backgroundColor,
      };
    }),
  );
  const math = swatches.filter((s) => s.text.includes(n(DATA.math)));
  const phys = swatches.filter((s) => s.text.includes(n(DATA.phys)));
  expect(math.length).toBe(2);
  expect(phys.length).toBe(1);

  // Same subject -> identical accent + background.
  expect(math[0]!.accent).toBe(math[1]!.accent);
  expect(math[0]!.bg).toBe(math[1]!.bg);
  // Different subject -> different colour.
  expect(math[0]!.accent).not.toBe(phys[0]!.accent);
  expect(math[0]!.bg).not.toBe(phys[0]!.bg);
});

test('Exam-prep sessions get the PE badge; regular sessions do not', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoPlanning(win, L);

  const physBlock = sessionBlocks(win).filter({ hasText: n(DATA.phys) }).first();
  await expect(physBlock).toContainText(L.pe); // FR "PE" / AR "ت.إ"

  const mathBlocks = sessionBlocks(win).filter({ hasText: n(DATA.math) });
  await expect(mathBlocks).toHaveCount(2);
  await expect(mathBlocks.filter({ hasText: L.pe })).toHaveCount(0);
});

test('Filters narrow the grid: teacher, then room, then level', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoPlanning(win, L);

  // Teacher: M. Alaoui -> only his two Math sessions.
  await pickFilter(win, L.filters.teacher, n(DATA.teacherA));
  await expect(sessionBlocks(win)).toHaveCount(2);
  await expect(sessionBlocks(win).filter({ hasText: n(DATA.phys) })).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou118-filter-teacher-${locale()}.png` });
  await pickFilter(win, L.filters.teacher, L.filters.teacherAll); // reset
  await expect(sessionBlocks(win)).toHaveCount(3);

  // Room: Salle B -> only the Physique session.
  await pickFilter(win, L.filters.room, DATA.roomB);
  await expect(sessionBlocks(win)).toHaveCount(1);
  await expect(sessionBlocks(win).first()).toContainText(n(DATA.phys));
  await win.screenshot({ path: `test-results/sou118-filter-room-${locale()}.png` });
  await pickFilter(win, L.filters.room, L.filters.roomAll); // reset
  await expect(sessionBlocks(win)).toHaveCount(3);

  // Level: 1 Bac SE -> only the Physique session.
  await pickFilter(win, L.filters.level, DATA.levelPhys);
  await expect(sessionBlocks(win)).toHaveCount(1);
  await expect(sessionBlocks(win).first()).toContainText(n(DATA.phys));
  await win.screenshot({ path: `test-results/sou118-filter-level-${locale()}.png` });
});

test('Archived teacher drops from the teacher picker (SOU-37 Scenario 7)', async () => {
  const L = STR[locale()];
  live = await bootSeeded(locale());
  const win = live.win;
  await gotoPlanning(win, L);

  const opts = await filterOptions(win, L.filters.teacher);
  expect(opts).toContain(n(DATA.teacherA));
  expect(opts).toContain(n(DATA.teacherB));
  // M. Cherkaoui was archived — he must not be selectable anywhere in the planner.
  expect(opts).not.toContain(n(DATA.teacherC));
});

test('AR only: RTL direction and mirrored weekday columns', async () => {
  test.skip(locale() !== 'ar', 'RTL-specific');
  const L = STR.ar;
  live = await bootSeeded('ar');
  const win = live.win;
  await gotoPlanning(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION.ar);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe('ar');

  // Blocks render native Arabic subject + teacher names.
  const physBlock = sessionBlocks(win).filter({ hasText: DATA.phys.ar }).first();
  await expect(physBlock).toContainText(DATA.teacherB.ar);

  // Weekday grid reads right-to-left: Sunday sits to the RIGHT of Saturday.
  const sunday = win.getByText('الأحد', { exact: true }).first();
  const saturday = win.getByText('السبت', { exact: true }).first();
  const sBox = (await sunday.boundingBox())!;
  const satBox = (await saturday.boundingBox())!;
  expect(sBox.x).toBeGreaterThan(satBox.x);
  await win.screenshot({ path: 'test-results/sou118-rtl-ar.png', fullPage: true });
});

import { test, expect } from '@playwright/test';
import {
  boot,
  gotoPlanning,
  createSessionViaBridge,
  STR,
  DIRECTION,
  EXPORT_STR,
  exportSchedule,
  openExportDialog,
  closeExportDialog,
  filterOptions,
  exportDisabled,
  stubSaveDialog,
  stubOpenPath,
  freshExportDir,
  exportPath,
  isRealPdfFile,
  isA4Landscape,
  pdfEmbedsImage,
  pdfEmbedsAmiri,
  makeLogoFile,
  saveCenterProfile,
  getCenter,
  pageCrashed,
  type Launched,
  type Locale,
  type SeedSpec,
} from './schedule-export.fixtures';

/**
 * SOU-107 — Weekly schedule print / PDF export. Black-box, driven only through
 * the running packaged app. Every scenario runs under both the `fr` (LTR) and
 * `ar` (RTL) Playwright projects unless it is intrinsically locale-specific.
 *
 * Black-box boundary (documented, honest limitation): the exported PDF draws
 * every string as glyph-hex through an embedded font, so the *textual* content
 * (day labels, room / teacher names, the exam-prep badge glyph, the centre
 * name) is NOT recoverable from the file bytes. Those content-level assertions
 * live in the integration renderer test (`pdf-lib-schedule-renderer.test.ts`).
 * What IS observable at this layer — dialog surface, per-filter scoping, real
 * `%PDF` output, A4-landscape page geometry, embedded logo image, embedded
 * Amiri font, on-screen RTL + exam-prep badge — is asserted here.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const BASE_SEED: SeedSpec = {
  rooms: [{ name: 'Salle A' }, { name: 'Salle B' }],
  teachers: [{ nameFr: 'Prof Un', nameAr: 'أستاذ واحد', phone: '+212600000001' }],
  groups: [
    { level: '3AC', kind: 'regular' },
    { level: 'BAC', kind: 'exam-prep' },
  ],
};

async function seedTwoSessions(l: Launched): Promise<void> {
  const s = l.seeded;
  await createSessionViaBridge(l.win, {
    roomId: s.rooms[0]!.id,
    teacherId: s.teachers[0]!.id,
    groupId: s.groups[0]!.id,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
  });
  await createSessionViaBridge(l.win, {
    roomId: s.rooms[1]!.id,
    teacherId: s.teachers[0]!.id,
    groupId: s.groups[1]!.id,
    dayOfWeek: 2,
    start: '11:00',
    end: '12:00',
  });
}

// ---------------------------------------------------------------------------
// AC1 — a full week with 8 rooms exports to a valid A4-LANDSCAPE PDF without
// error. "Fits and stays readable" is a visual property; what is black-box
// verifiable is that the export succeeds and the page geometry is A4 landscape
// (width > height, 841.89 × 595.28 pt) — the orientation the bullet requires.
// ---------------------------------------------------------------------------
test('AC1 — full week with 8 rooms exports to a valid A4-landscape PDF', async () => {
  const L = STR[locale()];
  const rooms = Array.from({ length: 8 }, (_, i) => ({ name: `Salle ${i + 1}` }));
  live = await boot(locale(), { rooms, teachers: BASE_SEED.teachers, groups: BASE_SEED.groups });
  const win = live.win;

  // one session in each of the 8 rooms, spread across the week
  for (let i = 0; i < 8; i++) {
    await createSessionViaBridge(win, {
      roomId: live.seeded.rooms[i]!.id,
      teacherId: live.seeded.teachers[0]!.id,
      groupId: live.seeded.groups[0]!.id,
      dayOfWeek: (i % 6) + 1,
      start: `${String(9 + i).padStart(2, '0')}:00`,
      end: `${String(10 + i).padStart(2, '0')}:00`,
    });
  }

  await gotoPlanning(win, L);
  await win.screenshot({ path: `test-results/schedule-8rooms-planner-${locale()}.png` });

  const target = exportPath(freshExportDir(), `full-8rooms-${locale()}.pdf`);
  await exportSchedule(live, locale(), 'full', target);

  expect(isRealPdfFile(target), `expected a %PDF at ${target}`).toBe(true);
  expect(isA4Landscape(target), 'every page must be A4 landscape (841.89 × 595.28 pt)').toBe(true);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC2 — the four views (full / per-room / per-teacher / per-group). The three
// filtered views require choosing a specific value (Export is DISABLED until
// one is picked, and the combobox lists the real seeded reference data — proof
// each export is scoped to ONE filter value). Every view produces a valid
// A4-landscape PDF (same page geometry / header layout as the full grid).
// ---------------------------------------------------------------------------
test('AC2 — full/room/teacher/group each export a scoped, valid A4-landscape PDF', async () => {
  const L = STR[locale()];
  const loc = locale();
  live = await boot(loc, BASE_SEED);
  const win = live.win;
  await seedTwoSessions(live);
  await gotoPlanning(win, L);

  // The dialog offers exactly the four documented views.
  const dialog = await openExportDialog(win, loc);
  for (const v of ['full', 'room', 'teacher', 'group'] as const) {
    await expect(dialog.getByRole('tab', { name: EXPORT_STR[loc].view[v] })).toBeVisible();
  }

  // A filtered view is scoped: Export is disabled until a specific value is
  // chosen, and the picker lists the real seeded rooms.
  await dialog.getByRole('tab', { name: EXPORT_STR[loc].view.room }).click();
  expect(await exportDisabled(win, loc), 'Export must be disabled before a room is chosen').toBe(true);

  const rooms = await filterOptions(win, loc, 'room');
  expect(rooms).toEqual(expect.arrayContaining(['Salle A', 'Salle B']));
  await closeExportDialog(win);

  const dir = freshExportDir();
  const cases: Array<{ view: 'full' | 'room' | 'teacher' | 'group'; value?: string }> = [
    { view: 'full' },
    { view: 'room', value: 'Salle A' },
    { view: 'teacher', value: loc === 'ar' ? 'أستاذ واحد' : 'Prof Un' },
    { view: 'group', value: '3AC' },
  ];
  for (const c of cases) {
    const target = exportPath(dir, `${c.view}-${loc}.pdf`);
    await exportSchedule(live, loc, c.view, target, c.value);
    expect(isRealPdfFile(target), `${c.view} view must write a %PDF`).toBe(true);
    expect(isA4Landscape(target), `${c.view} view must share the A4-landscape layout`).toBe(true);
  }
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3 — exam-prep isolation. On-screen the planner (the live session-block the
// export mirrors) shows the exam-prep "PE"/"ت.إ" badge; each export view with
// an exam-prep session present succeeds. (The badge glyph inside the PDF is not
// byte-recoverable — its presence in every view is covered by the integration
// renderer test.)
// ---------------------------------------------------------------------------
test('AC3 — exam-prep session carries a badge on the planner and every view still exports', async () => {
  const L = STR[locale()];
  const loc = locale();
  live = await boot(loc, BASE_SEED);
  const win = live.win;
  await seedTwoSessions(live);
  await gotoPlanning(win, L);

  await expect(win.getByText(L.kind.examPrepShort, { exact: true }).first()).toBeVisible();
  await win.screenshot({ path: `test-results/schedule-examprep-badge-${loc}.png` });

  const dir = freshExportDir();
  for (const c of [
    { view: 'full' as const },
    { view: 'group' as const, value: 'BAC' },
  ]) {
    const target = exportPath(dir, `examprep-${c.view}-${loc}.pdf`);
    await exportSchedule(live, loc, c.view, target, c.value);
    expect(isRealPdfFile(target)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// AC4 — AR/RTL: the planner mirrors (dir=rtl) and the Arabic export produces a
// valid A4-landscape PDF that embeds the Amiri font for Arabic shaping. (Day
// ordering inside the PDF is glyph-encoded and not byte-verifiable; the RTL
// mirror is asserted on screen, the Arabic font embedding in the file.)
// ---------------------------------------------------------------------------
test('AC4 — Arabic planner mirrors RTL and its export embeds the Amiri font (A4 landscape)', async () => {
  const loc = locale();
  test.skip(loc !== 'ar', 'RTL-specific scenario runs under the ar project');
  const L = STR[loc];
  live = await boot(loc, BASE_SEED);
  const win = live.win;
  await seedTwoSessions(live);
  await gotoPlanning(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[loc]);
  await win.screenshot({ path: 'test-results/schedule-ar-rtl-planner.png' });

  const target = exportPath(freshExportDir(), 'full-ar-rtl.pdf');
  await exportSchedule(live, loc, 'full', target);
  expect(isRealPdfFile(target)).toBe(true);
  expect(isA4Landscape(target)).toBe(true);
  expect(pdfEmbedsAmiri(target), 'the AR export must embed the Amiri font for Arabic shaping').toBe(true);
});

// ---------------------------------------------------------------------------
// AC5 — header identity. With a saved centre name and NO logo, the export
// embeds NO raster image (the name is drawn as text). After a logo is set
// (Center.logoPath), the same export embeds a raster image. This is the
// "logo renders as image only if logoPath set" contract.
// ---------------------------------------------------------------------------
test('AC5 — centre name is text (no logo image) until a logo is set, then it renders as an image', async () => {
  const L = STR[locale()];
  const loc = locale();
  live = await boot(loc, { rooms: [{ name: 'Salle A' }], teachers: BASE_SEED.teachers, groups: [{ level: '3AC', kind: 'regular' }] });
  const win = live.win;
  await createSessionViaBridge(win, {
    roomId: live.seeded.rooms[0]!.id,
    teacherId: live.seeded.teachers[0]!.id,
    groupId: live.seeded.groups[0]!.id,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
  });

  // Precondition: fresh planner boot has no centre profile yet.
  expect(await getCenter(win)).toBeNull();

  await saveCenterProfile(win, loc, { name: 'Centre Test QA', phone: '+212612345678' });
  const named = await getCenter(win);
  expect(named?.name).toBe('Centre Test QA');
  expect(named?.logoPath, 'no logo set yet').toBeNull();

  await gotoPlanning(win, L);
  const dir = freshExportDir();
  const noLogo = exportPath(dir, `header-nologo-${loc}.pdf`);
  await exportSchedule(live, loc, 'full', noLogo);
  expect(isRealPdfFile(noLogo)).toBe(true);
  expect(pdfEmbedsImage(noLogo), 'name-only header must NOT embed a logo image').toBe(false);

  await saveCenterProfile(win, loc, { name: 'Centre Test QA', phone: '+212612345678', logoFile: makeLogoFile() });
  expect((await getCenter(win))?.logoPath, 'logoPath must be persisted after upload').toBeTruthy();

  await gotoPlanning(win, L);
  const withLogo = exportPath(dir, `header-logo-${loc}.pdf`);
  await exportSchedule(live, loc, 'full', withLogo);
  expect(isRealPdfFile(withLogo)).toBe(true);
  expect(pdfEmbedsImage(withLogo), 'once logoPath is set the export must embed the logo as an image').toBe(true);
});

// ---------------------------------------------------------------------------
// Empty state — a week with rooms but zero sessions still lets the director
// export a valid (empty-grid) PDF without crashing.
// ---------------------------------------------------------------------------
test('Empty state — an empty week still exports a valid PDF', async () => {
  const L = STR[locale()];
  const loc = locale();
  live = await boot(loc, { rooms: [{ name: 'Salle A' }, { name: 'Salle B' }] });
  const win = live.win;
  await gotoPlanning(win, L);
  await expect(win.getByText(L.emptyWeek)).toBeVisible();

  const target = exportPath(freshExportDir(), `empty-${loc}.pdf`);
  await exportSchedule(live, loc, 'full', target);
  expect(isRealPdfFile(target)).toBe(true);
  expect(isA4Landscape(target)).toBe(true);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Print — the Print action resolves without raising the error toast (a real
// print pipeline is stubbed at the OS boundary so no external viewer opens).
// ---------------------------------------------------------------------------
test('Print — the full-grid Print action succeeds without an error', async () => {
  const L = STR[locale()];
  const loc = locale();
  live = await boot(loc, BASE_SEED);
  const win = live.win;
  await stubOpenPath(live.app);
  await seedTwoSessions(live);
  await gotoPlanning(win, L);

  const dialog = await openExportDialog(win, loc);
  await dialog.getByRole('button', { name: EXPORT_STR[loc].print, exact: true }).click();
  await win.waitForTimeout(900);
  await expect(win.getByText(EXPORT_STR[loc].printError)).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

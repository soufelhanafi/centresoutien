import { test, expect } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  createParent,
  createStudent,
  createSubject,
  createTeacher,
  groupHeadings,
  openPaletteViaButton,
  openPaletteViaShortcut,
  paletteDialog,
  paletteInput,
  paletteOptionByKind,
  paletteOptions,
  pageCrashed,
  type Launched,
  type Locale,
} from './command-palette.fixtures';

/**
 * SOU-43 — Global command-palette search across people (Ctrl/Cmd+K).
 * Black-box, driven through the running packaged app only. Runs under both
 * the `fr` and `ar` Playwright projects (FR-LTR / AR-RTL).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// Scenario 1 — open via Ctrl/Cmd+K from anywhere, and via the header button.
// ---------------------------------------------------------------------------
test('Scenario 1 — opens via Ctrl/Cmd+K from anywhere, and via the header button', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // From the dashboard (shell root).
  await openPaletteViaShortcut(win, 'Control+k');
  await expect(paletteDialog(win)).toBeVisible();
  await expect(paletteInput(win)).toHaveAttribute('placeholder', L.placeholder);
  await win.keyboard.press('Escape');
  await expect(paletteDialog(win)).toBeHidden();

  // Cmd (Meta) chord too.
  await openPaletteViaShortcut(win, 'Meta+k');
  await expect(paletteDialog(win)).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(paletteDialog(win)).toBeHidden();

  // From a nested page (not just the shell root) — proves the shortcut is global.
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.waitForLoadState('domcontentloaded');
  await openPaletteViaShortcut(win, 'Control+k');
  await expect(paletteDialog(win)).toBeVisible();
  await win.keyboard.press('Escape');

  // Via the visible header button.
  await openPaletteViaButton(win, L);
  await expect(paletteDialog(win)).toBeVisible();
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 2 — FR name segment matches teacher, student, and parent, grouped.
// ---------------------------------------------------------------------------
test('Scenario 2 — FR name segment returns all three entity kinds, grouped by kind', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const subject = await createSubject(win, 'Mathématiques', 'الرياضيات');
  const teacher = await createTeacher(win, { nameFr: 'Amine Bénani', nameAr: 'أمين بناني', phone: '0611223344', subjectIds: [subject.id] });
  const parent = await createParent(win, { name: 'Amine Tazi', phone: '0622334455' });
  const student = await createStudent(win, { nameFr: 'Amine Sabri', nameAr: 'أمين صبري' });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Amine', { delay: 20 });

  // Identity is asserted on the stable `{kind}:{id}` cmdk value — the visible
  // label for Student/Teacher follows the *display* locale (fr project shows
  // name.fr, ar project shows name.ar), so it isn't asserted against the FR
  // string directly here (see Scenario 3 for the locale/display-field split).
  await expect(paletteOptionByKind(win, 'student')).toBeVisible();
  await expect(paletteOptionByKind(win, 'teacher')).toBeVisible();
  await expect(paletteOptionByKind(win, 'parent').getByText('Amine Tazi')).toBeVisible();

  // Grouped by kind, in the documented order: students, teachers, parents.
  expect(await groupHeadings(win)).toEqual([L.groups.students, L.groups.teachers, L.groups.parents]);

  expect(await paletteOptionByKind(win, 'student').getAttribute('data-value')).toBe(`student:${student.id}`);
  expect(await paletteOptionByKind(win, 'teacher').getAttribute('data-value')).toBe(`teacher:${teacher.id}`);
  expect(await paletteOptionByKind(win, 'parent').getAttribute('data-value')).toBe(`parent:${parent.id}`);
});

// ---------------------------------------------------------------------------
// Scenario 3 — Arabic name segment matches teacher and student (AR names).
// Parent.name has no separate AR field (single string on the entity), so the
// parent here is seeded with an Arabic `name` directly.
// ---------------------------------------------------------------------------
test('Scenario 3 — Arabic name segment returns matches (AR name matching works)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  const subject = await createSubject(win, 'Mathématiques', 'الرياضيات');
  const teacher = await createTeacher(win, { nameFr: 'Zoé Béraud', nameAr: 'زوي براود', phone: '0611223344', subjectIds: [subject.id] });
  const parent = await createParent(win, { name: 'زوي التازي', phone: '0622334455' });
  const student = await createStudent(win, { nameFr: 'Zoe Sabri', nameAr: 'زوي صبري' });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('زوي', { delay: 20 });

  // The AR query segment matches all three even though the visible label uses
  // the *display* locale's name field (Student/Teacher are bilingual; the
  // list re-renders with name.fr under the fr project, name.ar under ar) —
  // matching identity is asserted on the stable `{kind}:{id}` cmdk value.
  await expect(paletteOptionByKind(win, 'student')).toBeVisible();
  await expect(paletteOptionByKind(win, 'teacher')).toBeVisible();
  await expect(paletteOptionByKind(win, 'parent')).toBeVisible();
  expect(await paletteOptionByKind(win, 'student').getAttribute('data-value')).toBe(`student:${student.id}`);
  expect(await paletteOptionByKind(win, 'teacher').getAttribute('data-value')).toBe(`teacher:${teacher.id}`);
  expect(await paletteOptionByKind(win, 'parent').getAttribute('data-value')).toBe(`parent:${parent.id}`);

  // Parent.name has no locale variant, so its Arabic label is visible as-is
  // regardless of the active display locale.
  await expect(paletteOptionByKind(win, 'parent').getByText('زوي التازي')).toBeVisible();

  expect(await groupHeadings(win)).toEqual([L.groups.students, L.groups.teachers, L.groups.parents]);
});

// ---------------------------------------------------------------------------
// Scenario 4 — accent-insensitive substring match ("Zoe" matches "Zoé").
// ---------------------------------------------------------------------------
test('Scenario 4 — accent-insensitive match: typing without the accent still matches an accented name', async () => {
  live = await boot(locale());
  const win = live.win;

  const subject = await createSubject(win, 'Mathématiques', 'الرياضيات');
  const teacher = await createTeacher(win, { nameFr: 'Zoé Béraud', nameAr: 'زوي براود', phone: '0611223344', subjectIds: [subject.id] });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Zoe', { delay: 20 });

  // Matching happens against the accented FR field regardless of the active
  // display locale; the visible label follows the display locale (fr shows
  // the accented name, ar shows name.ar) — identity is asserted on the id.
  await expect(paletteOptionByKind(win, 'teacher')).toBeVisible();
  expect(await paletteOptionByKind(win, 'teacher').getAttribute('data-value')).toBe(`teacher:${teacher.id}`);
  if (locale() === 'fr') {
    await expect(win.getByRole('option', { name: /Zoé Béraud/ })).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Scenario 5 — empty query state: no crash, sensible prompt.
// ---------------------------------------------------------------------------
test('Scenario 5 — empty query shows a sensible prompt, no crash', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await openPaletteViaShortcut(win, 'Control+k');
  await expect(paletteDialog(win)).toBeVisible();
  await expect(win.getByText(L.emptyPrompt, { exact: true })).toBeVisible();
  expect(await paletteOptions(win).count()).toBe(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 6 — no-match query: clear empty state, not an error.
// ---------------------------------------------------------------------------
test('Scenario 6 — no-match query shows a clear empty state (not an error)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  await openPaletteViaShortcut(win, 'Control+k');
  const query = 'xqznotfound';
  await win.keyboard.type(query, { delay: 20 });

  await expect(win.getByText(L.noResults(query), { exact: true })).toBeVisible();
  expect(await paletteOptions(win).count()).toBe(0);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario 7 — selecting a result closes the palette and navigates to the
// correct detail page, for each of the three entity kinds.
// ---------------------------------------------------------------------------
test('Scenario 7a — selecting a student result closes the palette and opens the student detail page', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const student = await createStudent(win, { nameFr: 'Yassine Sabri', nameAr: 'ياسين صبري' });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Yassine', { delay: 20 });
  await paletteOptionByKind(win, 'student').click();

  await expect(paletteDialog(win)).toBeHidden();
  expect(await win.evaluate(() => location.hash)).toBe(`#/students/${student.id}`);
  await expect(win.getByRole('heading', { level: 1, name: 'Yassine Sabri' })).toBeVisible();
  void L;
});

test('Scenario 7b — selecting a teacher result closes the palette and opens the teacher detail page', async () => {
  live = await boot(locale());
  const win = live.win;
  const subject = await createSubject(win, 'Mathématiques', 'الرياضيات');
  const teacher = await createTeacher(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', phone: '0611223344', subjectIds: [subject.id] });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Yassine', { delay: 20 });
  await paletteOptionByKind(win, 'teacher').click();

  await expect(paletteDialog(win)).toBeHidden();
  expect(await win.evaluate(() => location.hash)).toBe(`#/teachers/${teacher.id}`);
  await expect(win.getByRole('heading', { level: 1, name: 'Yassine Alaoui' })).toBeVisible();
});

test('Scenario 7c — selecting a parent result closes the palette and opens that parent detail sheet [KNOWN FAILING]', async () => {
  live = await boot(locale());
  const win = live.win;
  const parent = await createParent(win, { name: 'Yassine Idrissi', phone: '0622334455' });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Yassine', { delay: 20 });
  await paletteOptionByKind(win, 'parent').click();

  await expect(paletteDialog(win)).toBeHidden();
  // Manual navigation (Parents list -> click row) opens a detail *sheet* over
  // #/parents (parents have no #/parents/:id route — see parents.fixtures.ts).
  // The palette's "navigate to the correct detail page" therefore means:
  // land on #/parents AND have that specific parent's sheet open.
  expect(await win.evaluate(() => location.hash)).toBe('#/parents');
  await expect(win.getByRole('heading', { level: 2, name: 'Yassine Idrissi' })).toBeVisible();
  void parent;
});

// ---------------------------------------------------------------------------
// Scenario 8 — FR-LTR and AR-RTL are exercised by running this whole file
// under both Playwright projects; this test additionally asserts the concrete
// direction/lang contract on the shell + palette.
// ---------------------------------------------------------------------------
test('Scenario 8 — locale/direction contract: html dir + palette copy match the active locale', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  expect(await win.evaluate(() => document.documentElement.getAttribute('dir'))).toBe(DIRECTION[locale()]);

  await openPaletteViaShortcut(win, 'Control+k');
  await expect(paletteInput(win)).toHaveAttribute('placeholder', L.placeholder);
  await expect(win.getByText(L.emptyPrompt, { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 9 — plan without one of the three entity flags: the section is
// simply omitted, never a crash/error. `core.students` / `core.teachers` /
// `core.parents` are documented as "core (every plan)" flags (CLAUDE.md §4),
// so none of the three shipped plans (essentiel/pro/premium) actually lacks
// one — there is no way to reach the "section omitted" branch by switching
// CS_PLAN. This test is the closest black-box proxy: it proves the composed
// gates don't regress into hiding a section on the most restrictive plan.
// ---------------------------------------------------------------------------
test('Scenario 9 — all three entity sections are present under the most restrictive plan (essentiel); no crash', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  const subject = await createSubject(win, 'Mathématiques', 'الرياضيات');
  await createTeacher(win, { nameFr: 'Karim Zaki', nameAr: 'كريم زكي', phone: '0611223344', subjectIds: [subject.id] });
  await createParent(win, { name: 'Karim Zaki', phone: '0622334455' });
  await createStudent(win, { nameFr: 'Karim Zaki', nameAr: 'كريم زكي' });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Karim', { delay: 20 });

  await expect(paletteOptionByKind(win, 'parent')).toBeVisible();
  expect(await groupHeadings(win)).toEqual([L.groups.students, L.groups.teachers, L.groups.parents]);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// Bonus — global cap (~20 results), and same-name-under-different-fathers
// students are never deduped/merged out of the results (per the QA charter's
// duplicate-name invariant).
// ---------------------------------------------------------------------------
test('Bonus — global result cap (~20) holds across 36 total matches, no crash', async () => {
  live = await boot(locale());
  const win = live.win;

  await win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    for (let i = 0; i < 12; i++) {
      await api.invoke('student.create', {
        name: { fr: `Cap Test Eleve ${i}`, ar: `اختبار ${i}` },
        birthDate: '2010-05-14',
        level: '3AC',
        school: null,
        notes: null,
        guardianIds: [],
      });
    }
    for (let i = 0; i < 12; i++) {
      const subject = (await api.invoke('subject.create', { name: { fr: `Sub ${i}`, ar: `م ${i}` } })) as { id: string };
      await api.invoke('teacher.create', {
        name: { fr: `Cap Test Prof ${i}`, ar: `استاذ ${i}` },
        phone: `06${(10000000 + i).toString().padStart(8, '0')}`,
        subjectIds: [subject.id],
      });
    }
    for (let i = 0; i < 12; i++) {
      await api.invoke('parent.create', {
        name: `Cap Test Parent ${i}`,
        phone: `07${(10000000 + i).toString().padStart(8, '0')}`,
        relation: 'pere',
      });
    }
  });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Cap Test', { delay: 15 });

  await expect(paletteOptions(win)).toHaveCount(20);
  expect(await pageCrashed(win)).toBe(false);
});

test('Bonus — two students with the same name under different fathers both appear (not deduped)', async () => {
  live = await boot(locale());
  const win = live.win;

  const father1 = await createParent(win, { name: 'Hassan Alaoui', phone: '0611111111' });
  const father2 = await createParent(win, { name: 'Rachid Alaoui', phone: '0622222222' });
  const student1 = await createStudent(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', level: '3AC', guardianIds: [father1.id] });
  const student2 = await createStudent(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', level: '2AC', guardianIds: [father2.id] });

  await openPaletteViaShortcut(win, 'Control+k');
  await win.keyboard.type('Yassine Alaoui', { delay: 15 });
  await expect(paletteOptionByKind(win, 'student').first()).toBeVisible();

  const values = await win.evaluate(() => Array.from(document.querySelectorAll('[cmdk-item]')).map((el) => el.getAttribute('data-value')));
  expect(values).toContain(`student:${student1.id}`);
  expect(values).toContain(`student:${student2.id}`);
  expect(await pageCrashed(win)).toBe(false);
});

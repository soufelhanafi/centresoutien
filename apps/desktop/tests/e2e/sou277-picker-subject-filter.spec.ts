import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  nameOf,
  gotoPlanning,
  openCreate,
  pickOption,
  pickOptionContaining,
  readOptions,
  pageCrashed,
  type Locale,
  type SeedSpec,
  type Launched,
  type Seeded,
} from './sou277-picker-subject-filter.fixtures';

/**
 * SOU-277 — subject-based cross-filtering of the teacher/group pickers in the
 * create-session drawer (SessionAssignmentFields). Black-box: driven only
 * through the running packaged app + public preload bridge. Runs under both the
 * `fr` (LTR) and `ar` (RTL) Playwright projects, so every scenario is exercised
 * in FR-LTR and AR-RTL (AC7).
 *
 * A single seed shape backs the whole suite:
 *   subjects : Mathématiques (idx0), Physique (idx1)
 *   teachers : Karim(Math), Samir(Physique), Nadia(NO subjects)
 *   groups   : Math regular (MG-REG), Math exam-prep (MG-PREP), Physique (PG-REG)
 * Groups are seeded with no assigned teacher so the picker filter is exercised on
 * the group's SUBJECT alone.
 */

const locale = () => test.info().project.name as Locale;

const SEED: SeedSpec = {
  subjects: [
    { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' },
    { nameFr: 'Physique', nameAr: 'الفيزياء', code: 'PHYS' },
  ],
  teachers: [
    { nameFr: 'Karim Mathprof', nameAr: 'كريم رياضيات', phone: '+212600000001', subjectIdx: [0] },
    { nameFr: 'Samir Physprof', nameAr: 'سمير فيزياء', phone: '+212600000002', subjectIdx: [1] },
    { nameFr: 'Nadia Nosubj', nameAr: 'نادية بلا مادة', phone: '+212600000003', subjectIdx: [] },
  ],
  groups: [
    { level: 'MG-REG', subjectIdx: 0, kind: 'regular' },
    { level: 'MG-PREP', subjectIdx: 0, kind: 'exam-prep' },
    { level: 'PG-REG', subjectIdx: 1, kind: 'regular' },
  ],
};

let live: (Launched & { seeded: Seeded }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

type Names = { mathSubj: string; physSubj: string; karim: string; samir: string; nadia: string };
function names(loc: Locale, seeded: Seeded): Names {
  return {
    mathSubj: loc === 'ar' ? SEED.subjects[0]!.nameAr : SEED.subjects[0]!.nameFr,
    physSubj: loc === 'ar' ? SEED.subjects[1]!.nameAr : SEED.subjects[1]!.nameFr,
    karim: nameOf(loc, seeded.teachers[0]!),
    samir: nameOf(loc, seeded.teachers[1]!),
    nadia: nameOf(loc, seeded.teachers[2]!),
  };
}

async function bootPlanning(loc: Locale): Promise<{ win: Page; L: (typeof STR)[Locale]; n: Names }> {
  const L = STR[loc];
  live = await boot(loc, SEED);
  const win = live.win;
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[loc]);
  await gotoPlanning(win, L);
  return { win, L, n: names(loc, live.seeded) };
}

// ---------------------------------------------------------------------------
// AC1 — pick a Math teacher → the group picker shows only Math groups.
// ---------------------------------------------------------------------------
test('AC1 — selecting a Math teacher filters the group picker to Math groups only', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  await pickOption(win, dialog, L.form.teacher, n.karim);
  const groups = await readOptions(win, dialog, L.form.group);

  // Both Math groups offered; the Physique group is gone. Localized subject name proves AC7 labelling.
  expect(groups.some((o) => o.includes('MG-REG') && o.includes(n.mathSubj))).toBe(true);
  expect(groups.some((o) => o.includes('MG-PREP'))).toBe(true);
  expect(groups.some((o) => o.includes('PG-REG'))).toBe(false);
  expect(groups.some((o) => o.includes(n.physSubj))).toBe(false);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou277-ac1-group-filtered-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — pick a Math group first → the teacher picker lists only Math teachers.
// ---------------------------------------------------------------------------
test('AC2 — selecting a Math group filters the teacher picker to Math teachers only', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  await pickOptionContaining(win, dialog, L.form.group, 'MG-REG');
  const teachers = await readOptions(win, dialog, L.form.teacher);

  expect(teachers).toContain(n.karim);
  expect(teachers).not.toContain(n.samir);
  expect(teachers).not.toContain(n.nadia);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou277-ac2-teacher-filtered-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC4 — the "Unassigned" option is always present in BOTH pickers, whatever the
// other picker holds.
// ---------------------------------------------------------------------------
test('AC4 — the Unassigned option stays available in both pickers regardless of the other selection', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  // With a Math teacher set, the group picker still offers "Sans groupe".
  await pickOption(win, dialog, L.form.teacher, n.karim);
  expect(await readOptions(win, dialog, L.form.group)).toContain(L.form.groupNone);

  // With a Math group set, the teacher picker still offers "Sans enseignant".
  await pickOptionContaining(win, dialog, L.form.group, 'MG-REG');
  expect(await readOptions(win, dialog, L.form.teacher)).toContain(L.form.teacherNone);

  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC5 — a teacher with NO subjects is hidden once a subject-bearing group is
// selected, and shown again when no group is selected.
// ---------------------------------------------------------------------------
test('AC5 — a subject-less teacher is hidden under a subject-bearing group and shown again with no group', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  // No group yet → the subject-less teacher IS offered.
  expect(await readOptions(win, dialog, L.form.teacher)).toContain(n.nadia);

  // Select a subject-bearing (Math) group → the subject-less teacher disappears.
  await pickOptionContaining(win, dialog, L.form.group, 'MG-REG');
  expect(await readOptions(win, dialog, L.form.teacher)).not.toContain(n.nadia);

  // Reset the group to "Unassigned" → the subject-less teacher is shown again.
  await pickOption(win, dialog, L.form.group, L.form.groupNone);
  expect(await readOptions(win, dialog, L.form.teacher)).toContain(n.nadia);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou277-ac5-subjectless-teacher-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC6 — exam-prep vs regular KIND is not a filter criterion: a Math teacher's
// group picker offers BOTH the regular and the exam-prep Math group.
// ---------------------------------------------------------------------------
test('AC6 — kind is not a filter: a Math teacher sees both the regular and exam-prep Math groups', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  await pickOption(win, dialog, L.form.teacher, n.karim);
  const groups = await readOptions(win, dialog, L.form.group);

  const mathGroups = groups.filter((o) => o.includes(n.mathSubj));
  expect(mathGroups.length).toBe(2); // regular + exam-prep, both surface on subject match
  expect(groups.some((o) => o.includes('MG-REG'))).toBe(true);
  expect(groups.some((o) => o.includes('MG-PREP'))).toBe(true); // exam-prep group NOT filtered out by kind
  expect(groups.some((o) => o.includes('PG-REG'))).toBe(false); // subject (not kind) is the sole criterion

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou277-ac6-kind-not-filtered-${loc}.png` });
});

// ---------------------------------------------------------------------------
// AC3 (protection half) — because both pickers hide options incompatible with
// the other's current value, an incompatible teacher+group pair can NEVER be
// assembled through the drawer. This is the observable positive contract of the
// cross-filter. (The complementary "clear + inline hint on switch" behaviour is
// documented in the QA report: it is unreachable through the live pickers because
// no incompatible selection is ever offered — see report.)
// ---------------------------------------------------------------------------
test('AC3 — the pickers never allow an incompatible teacher+group pair to be assembled', async () => {
  const loc = locale();
  const { win, L, n } = await bootPlanning(loc);
  const dialog = await openCreate(win, L);

  // Teacher = Math → the Physique group is not offered.
  await pickOption(win, dialog, L.form.teacher, n.karim);
  expect((await readOptions(win, dialog, L.form.group)).some((o) => o.includes('PG-REG'))).toBe(false);

  // Reset, then Group = Physique → the Math teacher is not offered.
  await pickOption(win, dialog, L.form.teacher, L.form.teacherNone);
  await pickOptionContaining(win, dialog, L.form.group, 'PG-REG');
  expect(await readOptions(win, dialog, L.form.teacher)).not.toContain(n.karim);

  expect(await pageCrashed(win)).toBe(false);
});

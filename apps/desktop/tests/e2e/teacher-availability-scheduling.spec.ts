import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  saveAvailability,
  createWeeklySession,
  seedGeneratedSession,
  readWeek,
  emptyWeek,
  gotoPlanning,
  gotoTeacherAvailability,
  gotoAudit,
  openCreate,
  fillSessionForm,
  pageCrashed,
  type Launched,
  type Seeded,
  type Locale,
} from './teacher-availability-scheduling.fixtures';
import { MONDAYS, DATE } from './schedule-audit.dates';

/**
 * SOU-283 — teacher-availability enforcement on manual session scheduling.
 * Black-box, driven only through the running packaged app + public preload
 * bridge. Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects, so
 * every scenario below is exercised in FR-LTR and AR-RTL.
 *
 * Acceptance criteria covered:
 *   1. whole-week-off teacher → drawer surfaces a FORCEABLE availability warning
 *      (not a silent create); the session persists only after an explicit force.
 *   2. teacher with NO availability row → scheduled with NO warning.
 *   3. partial window (Mon 14:00–18:00) → in-window creates cleanly; outside the
 *      window (wrong time OR wrong day) raises the forceable warning.
 *   4. non-blocking re-check: narrowing a teacher's availability so an existing
 *      in-window session falls out surfaces a summary popup; the save succeeds.
 *   5. schedule audit lists an out-of-window session as a "teacher availability"
 *      finding.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { seeded: Seeded }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const teacherName = (seeded: Seeded, loc: Locale) => (loc === 'ar' ? seeded.teacher.nameAr : seeded.teacher.nameFr);

/** Assert the drawer is showing the forceable availability warning and nothing was persisted. */
async function expectForceableWarning(win: Page, dialog: ReturnType<Page['getByRole']>, L: (typeof STR)[Locale]) {
  await expect(dialog.getByText(L.warning.message)).toBeVisible();
  await expect(dialog.getByRole('button', { name: L.form.scheduleAnyway })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.form.createSuccess)).toHaveCount(0);
  expect(await readWeek(win)).toHaveLength(0);
}

// ---------------------------------------------------------------------------
// AC1 — whole-week-off teacher cannot be silently scheduled: warning + force.
// ---------------------------------------------------------------------------
test('AC1 — a whole-week-off teacher raises a forceable warning; session persists only after force', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await saveAvailability(win, live.seeded.teacher.id, emptyWeek());

  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);
  await gotoPlanning(win, L);
  await expect(win.getByText(L.emptyWeek)).toBeVisible();

  const dialog = await openCreate(win, L);
  await fillSessionForm(win, dialog, L, {
    room: live.seeded.roomName,
    dayName: L.weekdays[1],
    teacher: teacherName(live.seeded, locale()),
    start: '15:00',
    end: '16:00',
  });
  await dialog.getByRole('button', { name: L.form.create }).click();

  // The create is NOT silently accepted: warning + force button, nothing written.
  await expectForceableWarning(win, dialog, L);

  // Explicit force → the session is created and persisted for this teacher.
  await dialog.getByRole('button', { name: L.form.scheduleAnyway }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();

  const wk = await readWeek(win);
  expect(wk).toHaveLength(1);
  expect(wk[0]).toMatchObject({ dayOfWeek: 1, start: '15:00', end: '16:00', teacherId: live.seeded.teacher.id });
  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou283-ac1-whole-week-off-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — a teacher with NO availability row is scheduled with no warning.
// ---------------------------------------------------------------------------
test('AC2 — an unconfigured teacher (no availability row) is scheduled with no warning', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  // Intentionally NO saveAvailability — the teacher is unrestricted.

  await gotoPlanning(win, L);
  const dialog = await openCreate(win, L);
  await fillSessionForm(win, dialog, L, {
    room: live.seeded.roomName,
    dayName: L.weekdays[1],
    teacher: teacherName(live.seeded, locale()),
    start: '15:00',
    end: '16:00',
  });
  await dialog.getByRole('button', { name: L.form.create }).click();

  // Straight to success — enforcement must NOT fire for the unconfigured case.
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByText(L.warning.title)).toHaveCount(0);
  await expect(win.getByRole('button', { name: L.form.scheduleAnyway })).toHaveCount(0);

  const wk = await readWeek(win);
  expect(wk).toHaveLength(1);
  expect(wk[0]).toMatchObject({ teacherId: live.seeded.teacher.id });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3a — partial window (Mon 14:00–18:00): a session INSIDE it creates cleanly.
// ---------------------------------------------------------------------------
test('AC3 — an in-window session (Mon 15:00-16:00, avail Mon 14:00-18:00) creates cleanly with no warning', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await saveAvailability(win, live.seeded.teacher.id, { ...emptyWeek(), 1: [{ open: '14:00', close: '18:00' }] });

  await gotoPlanning(win, L);
  const dialog = await openCreate(win, L);
  await fillSessionForm(win, dialog, L, {
    room: live.seeded.roomName,
    dayName: L.weekdays[1],
    teacher: teacherName(live.seeded, locale()),
    start: '15:00',
    end: '16:00',
  });
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByRole('button', { name: L.form.scheduleAnyway })).toHaveCount(0);
  expect(await readWeek(win)).toHaveLength(1);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3b — partial window: OUTSIDE it raises the forceable warning, both when the
// TIME is wrong (Mon 09:00–10:00) and when the DAY is wrong (Tue 15:00–16:00).
// ---------------------------------------------------------------------------
test('AC3 — out-of-window placements (wrong time, wrong day) each raise the forceable warning', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await saveAvailability(win, live.seeded.teacher.id, { ...emptyWeek(), 1: [{ open: '14:00', close: '18:00' }] });
  await gotoPlanning(win, L);

  // Wrong time — Monday 09:00–10:00 (before the 14:00 window opens).
  let dialog = await openCreate(win, L);
  await fillSessionForm(win, dialog, L, {
    room: live.seeded.roomName,
    dayName: L.weekdays[1],
    teacher: teacherName(live.seeded, locale()),
    start: '09:00',
    end: '10:00',
  });
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expectForceableWarning(win, dialog, L);
  await win.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Wrong day — Tuesday 15:00–16:00 (Tuesday is off entirely).
  dialog = await openCreate(win, L);
  await fillSessionForm(win, dialog, L, {
    room: live.seeded.roomName,
    dayName: L.weekdays[2],
    teacher: teacherName(live.seeded, locale()),
    start: '15:00',
    end: '16:00',
  });
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expectForceableWarning(win, dialog, L);

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou283-ac3-out-of-window-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// AC4 — non-blocking re-check: an in-window session, then availability narrowed
// so it falls out → summary popup lists it, and the save itself SUCCEEDS.
// ---------------------------------------------------------------------------
test('AC4 — narrowing availability that strands an existing session shows a non-blocking summary popup', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  const t = live.seeded.teacher;

  // Availability Mon 14:00–18:00, and a Mon 15:00–16:00 session INSIDE it.
  await saveAvailability(win, t.id, { ...emptyWeek(), 1: [{ open: '14:00', close: '18:00' }] });
  await createWeeklySession(win, { roomId: live.seeded.roomId, teacherId: t.id, dayOfWeek: 1, start: '15:00', end: '16:00' });

  await gotoTeacherAvailability(win, L, teacherName(live.seeded, locale()));

  // Turn Monday OFF entirely → the 15:00–16:00 session is now out-of-window.
  const toggleLabel = L.availability.toggle(L.weekdays[1]);
  const toggle = win
    .getByRole('switch', { name: toggleLabel })
    .or(win.getByRole('checkbox', { name: toggleLabel }))
    .or(win.getByLabel(toggleLabel));
  await toggle.first().click();

  await win.getByRole('button', { name: L.availability.save }).click();

  // Non-blocking: the save succeeds AND a summary popup lists the stranded session.
  await expect(win.getByText(L.availability.saved)).toBeVisible();
  await expect(win.getByText(L.availability.recheckTitle)).toBeVisible();

  // The popup is dismissible and the save was not rolled back by it.
  await win.getByRole('button', { name: L.availability.recheckDismiss }).click();
  await expect(win.getByText(L.availability.recheckTitle)).toBeHidden();

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou283-ac4-recheck-popup-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// AC5 — the schedule audit lists an out-of-window occurrence as a teacher
// availability finding (session within center hours, only the teacher window
// strands it).
// ---------------------------------------------------------------------------
test('AC5 — the schedule audit lists an out-of-window session as a teacher-availability finding', async () => {
  const L = STR[locale()];
  const D = DATE[locale()];
  live = await boot(locale());
  const win = live.win;
  const t = live.seeded.teacher;

  // A Mon 15:00–17:00 recurring session materialized on the next Monday. Center
  // hours default to 09:00–18:00, so it is WITHIN hours — only availability can strand it.
  await seedGeneratedSession(win, {
    roomId: live.seeded.roomId,
    teacherId: t.id,
    dayOfWeek: 1,
    start: '15:00',
    end: '17:00',
    from: MONDAYS.first,
    to: MONDAYS.first,
  });
  // Availability Mon 09:00–14:00 → the 15:00–17:00 occurrence is out of the teacher's window.
  await saveAvailability(win, t.id, { ...emptyWeek(), 1: [{ open: '09:00', close: '14:00' }] });

  await gotoAudit(win, L);
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByText(L.audit.reasonOutsideAvailability)).toBeVisible();
  await expect(dialog).toContainText(D.first);
  await expect(dialog).toContainText(teacherName(live.seeded, locale()));

  expect(await pageCrashed(win)).toBe(false);
  await win.screenshot({ path: `test-results/sou283-ac5-audit-finding-${locale()}.png` });
});

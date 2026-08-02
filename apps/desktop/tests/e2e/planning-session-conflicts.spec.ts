import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoPlanning, createSessionViaBridge, readWeek, type Launched, type Locale } from './planning-sessions.fixtures';

/**
 * SOU-131 — AC2: conflicting sessions are rejected with the SOU-55 conflict
 * messages, surfaced INLINE in the add-session drawer (not a toast). Four cases:
 * malformed time range (start >= end), outside center hours (default 09:00–18:00
 * when no hours are saved), room clash, teacher clash. Runs under both `fr` (LTR)
 * and `ar` (RTL) projects.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { seeded: { rooms: { id: string; name: string }[]; teachers: { id: string; nameFr: string; nameAr: string }[] } }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.form.new }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pickOption(win: Page, dialog: ReturnType<Page['getByRole']>, comboName: string, optionName: string) {
  await dialog.getByRole('combobox', { name: comboName }).click();
  await win.getByRole('option', { name: optionName, exact: true }).click();
}

/** Assert the conflict is inline in the drawer: message + "Conflit de planning"
 *  heading are inside the still-open dialog, and no success toast fired. */
async function expectInlineConflict(
  win: Page,
  dialog: ReturnType<Page['getByRole']>,
  L: (typeof STR)[Locale],
  message: string,
) {
  await expect(dialog.getByText(message)).toBeVisible();
  await expect(dialog.getByText(L.conflictTitle)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.form.createSuccess)).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// Malformed time range — start >= end.
// ---------------------------------------------------------------------------
test('rejects a malformed time range (start after end) inline', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  await gotoPlanning(win, L);

  const dialog = await openCreate(win, L);
  await pickOption(win, dialog, L.form.room, 'Salle A');
  await win.getByLabel(L.form.start, { exact: false }).fill('11:00');
  await win.getByLabel(L.form.end, { exact: false }).fill('10:00');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(dialog.getByText(L.errors.malformedTime)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(win.getByText(L.form.createSuccess)).toHaveCount(0);
  expect(await readWeek(win)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Outside center hours — 07:00–08:00 with no saved hours (default 09:00–18:00).
// Also confirms the agreed default window is enforced.
// ---------------------------------------------------------------------------
test('rejects a session outside center hours inline (default 09:00-18:00)', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  await gotoPlanning(win, L);

  const dialog = await openCreate(win, L);
  await pickOption(win, dialog, L.form.room, 'Salle A');
  await win.getByLabel(L.form.start, { exact: false }).fill('07:00');
  await win.getByLabel(L.form.end, { exact: false }).fill('08:00');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expectInlineConflict(win, dialog, L, L.errors.outsideHours);
  expect(await readWeek(win)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Room clash — the room is already booked on the same weekday + overlapping slot.
// ---------------------------------------------------------------------------
test('rejects a room clash inline', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  const roomA = live.seeded.rooms[0]!;

  // Pre-condition booked slot (via the same public write channel a click uses).
  await createSessionViaBridge(win, { roomId: roomA.id, dayOfWeek: 1, start: '10:00', end: '11:00' });
  await gotoPlanning(win, L);

  const dialog = await openCreate(win, L);
  await pickOption(win, dialog, L.form.room, 'Salle A');
  await win.getByLabel(L.form.start, { exact: false }).fill('10:00');
  await win.getByLabel(L.form.end, { exact: false }).fill('11:00');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expectInlineConflict(win, dialog, L, L.errors.roomConflict);
  // Only the pre-condition survives; the clashing attempt persisted nothing.
  expect(await readWeek(win)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Teacher clash — same teacher already booked, in a DIFFERENT room (so only the
// teacher clashes, not the room).
// ---------------------------------------------------------------------------
test('rejects a teacher clash inline', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    rooms: [{ name: 'Salle A' }, { name: 'Salle B' }],
    teachers: [{ nameFr: 'Prof Karim', nameAr: 'الأستاذ كريم', phone: '+212600112233' }],
  });
  const win = live.win;
  const roomB = live.seeded.rooms[1]!;
  const teacher = live.seeded.teachers[0]!;
  const teacherName = locale() === 'ar' ? teacher.nameAr : teacher.nameFr;

  await createSessionViaBridge(win, { roomId: roomB.id, teacherId: teacher.id, dayOfWeek: 1, start: '10:00', end: '11:00' });
  await gotoPlanning(win, L);

  const dialog = await openCreate(win, L);
  await pickOption(win, dialog, L.form.room, 'Salle A'); // different room → isolates the teacher clash
  await pickOption(win, dialog, L.form.teacher, teacherName);
  await win.getByLabel(L.form.start, { exact: false }).fill('10:00');
  await win.getByLabel(L.form.end, { exact: false }).fill('11:00');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expectInlineConflict(win, dialog, L, L.errors.teacherConflict);
  expect(await readWeek(win)).toHaveLength(1);
});

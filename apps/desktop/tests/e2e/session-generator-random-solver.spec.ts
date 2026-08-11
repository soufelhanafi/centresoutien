import { test, expect } from '@playwright/test';
import {
  boot,
  gotoPlanning,
  createSessionViaBridge,
  STR,
  DIRECTION,
  type Launched,
  type Locale,
} from './planning-sessions.fixtures';
import {
  openGenerator,
  GENERATOR_STR,
  switchGeneratorMode,
  submitGeneratorConfig,
  fillGeneratorDateRange,
} from './session-generator.fixtures';
import {
  previewAuto,
  proposalDays,
  setNumberField,
  CONFLICT_BANNER_RE,
} from './session-generator-random-solver.fixtures';

/**
 * SOU-182 — the random auto-planner must enumerate every min-gap-respecting
 * weekday combination, keep the first conflict-free one, and only flag a
 * conflict on a true dead-end.
 *
 * The observed bug: a Math group placed Mon/Sat clashed on the room Monday
 * while Tue/Fri (same min-gap) was free — the solver never tried it. These
 * scenarios engineer exactly that shape (some min-gap combos clash, an alternate
 * is free) and assert the alternate is chosen conflict-free; a dead-end fixture
 * (every eligible day clashes) asserts the conflict IS surfaced.
 *
 * The solver always slots sessions at the center's opening time (09:00, default
 * 09:00–18:00 hours) and — with a single seeded room — always uses that room, so
 * pre-booking that room's 09:00–10:30 slot on a weekday makes any combo using
 * that day clash. The chosen day-set is otherwise randomized among the
 * conflict-free candidates, so every "fix-proof" fixture leaves exactly ONE
 * conflict-free combo, making the expected day-set deterministic.
 */

const locale = () => test.info().project.name as Locale;

type Seeded = { rooms: { id: string; name: string }[]; teachers: { id: string }[]; groups: { id: string; level: string }[] };
let live: (Launched & { seeded: Seeded }) | null = null;
const pageErrors: Error[] = [];

test.afterEach(async () => {
  await live?.app.close();
  live = null;
  pageErrors.length = 0;
});

async function bootSolverCenter() {
  live = await boot(
    locale(),
    {
      rooms: [{ name: 'Salle A' }],
      teachers: [{ nameFr: 'Prof Karim', nameAr: 'الأستاذ كريم', phone: '+212600112233' }],
      groups: [{ level: 'Groupe Math', kind: 'regular' }],
    },
    'premium',
  );
  const win = live.win;
  win.on('pageerror', (err) => pageErrors.push(err));
  return { win, groupId: live.seeded.groups[0]!.id, roomId: live.seeded.rooms[0]!.id };
}

/** Pre-book the single room at the solver's 09:00–10:30 slot on each given weekday (no teacher, room-only clash). */
async function blockRoomOnDays(win: Launched['win'], roomId: string, days: number[]): Promise<void> {
  for (const d of days) {
    await createSessionViaBridge(win, { roomId, teacherId: null, dayOfWeek: d, start: '09:00', end: '10:30' });
  }
}

// ===========================================================================
// DATA-LEVEL scenarios — the exact `session.generator.preview` IPC the dialog's
// "Aperçu" button fires. `conflicts` here is the data behind the warning badge.
// ===========================================================================

// ---------------------------------------------------------------------------
// SCENARIO 1 (fix-proof, 2 slots/week) — the reported bug, reproduced exactly.
// Given a Math group, a single room booked Sun/Mon/Wed/Thu/Sat at 09:00 (so
// every min-gap combo touching those days clashes) leaving only Tue/Fri free,
// When the auto generator previews (2 sessions/week, min-gap 2),
// Then it must place the group Tue/Fri with ZERO conflicts (it searched past
// the clashing default combos instead of flagging a dead-end).
// ---------------------------------------------------------------------------
test('S1 — 2 slots: solver skips clashing combos and places the only free combo (Tue/Fri) conflict-free', async () => {
  const { win, groupId, roomId } = await bootSolverCenter();
  await blockRoomOnDays(win, roomId, [0, 1, 3, 4, 6]); // free days left: Tue(2), Fri(5)

  const result = await previewAuto(win, groupId, { weekdayPool: [0, 1, 2, 3, 4, 5, 6], minGapDays: 2, sessionsPerWeek: 2 });

  expect(result.proposals, 'the group must still be placed (a proposal is produced)').toHaveLength(1);
  expect(result.conflicts, `expected a conflict-free placement; got: ${JSON.stringify(result.conflicts)}`).toHaveLength(0);
  expect(proposalDays(result), 'the only conflict-free min-gap combo is Tue(2)/Fri(5)').toEqual([2, 5]);
  expect(pageErrors, 'no renderer errors').toHaveLength(0);
});

// ---------------------------------------------------------------------------
// SCENARIO 2 (true dead-end, 2 slots/week) — every eligible day clashes.
// Given the single room booked on ALL seven weekdays at 09:00,
// When the auto generator previews (2 sessions/week, min-gap 2),
// Then NO combination is conflict-free, so the conflict IS surfaced (non-empty
// `conflicts`, kind "room") while a proposal is still returned (non-blocking).
// ---------------------------------------------------------------------------
test('S2 — 2 slots: genuine dead-end (every day clashes) surfaces the conflict', async () => {
  const { win, groupId, roomId } = await bootSolverCenter();
  await blockRoomOnDays(win, roomId, [0, 1, 2, 3, 4, 5, 6]);

  const result = await previewAuto(win, groupId, { weekdayPool: [0, 1, 2, 3, 4, 5, 6], minGapDays: 2, sessionsPerWeek: 2 });

  expect(result.proposals, 'a proposal is still returned — the conflict never blocks').toHaveLength(1);
  expect(result.conflicts.length, 'a real dead-end must surface at least one conflict').toBeGreaterThan(0);
  expect(result.conflicts.every((c) => c.kind === 'room'), 'the surfaced conflicts are room clashes').toBe(true);
  expect(pageErrors).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// SCENARIO 3 (fix-proof, DIFFERENT slot count = 3 slots/week) — sanity per the
// acceptance-criteria scope note. Room booked Sun/Tue/Thu/Sat leaving only
// Mon/Wed/Fri free; with 3 sessions/week + min-gap 1 the sole conflict-free
// combo is Mon/Wed/Fri, which the solver must find.
// ---------------------------------------------------------------------------
test('S3 — 3 slots: solver searches and places the only free 3-day combo (Mon/Wed/Fri) conflict-free', async () => {
  const { win, groupId, roomId } = await bootSolverCenter();
  await blockRoomOnDays(win, roomId, [0, 2, 4, 6]); // free days left: Mon(1), Wed(3), Fri(5)

  const result = await previewAuto(win, groupId, { weekdayPool: [0, 1, 2, 3, 4, 5, 6], minGapDays: 1, sessionsPerWeek: 3 });

  expect(result.proposals).toHaveLength(1);
  expect(result.conflicts, `expected conflict-free 3-day placement; got: ${JSON.stringify(result.conflicts)}`).toHaveLength(0);
  expect(proposalDays(result), 'the only conflict-free 3-day combo is Mon(1)/Wed(3)/Fri(5)').toEqual([1, 3, 5]);
  expect(pageErrors).toHaveLength(0);
});

// ===========================================================================
// UI-LEVEL scenarios — drive the real Auto-mode dialog and assert the visible
// warning-badge (conflicts banner) contract. Runs in both FR-LTR and AR-RTL.
// The default eligible pool is Mon–Sat (Sunday off), so these engineer clashes
// within Mon–Sat only.
// ===========================================================================

// ---------------------------------------------------------------------------
// SCENARIO 4 (fix-proof, UI) — the preview shows the group placed with NO
// warning badge. Room booked Mon/Wed/Thu/Sat leaving only Tue/Fri free within
// the default Mon–Sat pool.
// ---------------------------------------------------------------------------
test('S4 — Auto dialog preview places the group with NO conflict badge (alternate combo found)', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win, roomId } = await bootSolverCenter();
  await blockRoomOnDays(win, roomId, [1, 3, 4, 6]); // within default Mon–Sat pool, leaves Tue(2)/Fri(5)
  await gotoPlanning(win, L);

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = win.getByRole('dialog');

  await switchGeneratorMode(dialog, G, 'auto');
  await setNumberField(dialog, 'sessionsPerWeek', 2);
  await setNumberField(dialog, 'minGapDays', 2);
  await fillGeneratorDateRange(dialog, '2026-08-10', '2026-08-31');
  await submitGeneratorConfig(dialog, G);

  // Proposal produced (commit action reachable) AND no conflict banner shown.
  await expect(dialog.getByRole('button', { name: G.commitAction, exact: true })).toBeVisible();
  await expect(dialog.getByText(CONFLICT_BANNER_RE[locale()])).toHaveCount(0);
  const roomWarning = new RegExp(G.warnings.room.replace('{{room}}', '.+').replace('{{day}}', '.+'));
  await expect(dialog.getByText(roomWarning)).toHaveCount(0);
  expect(pageErrors).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// SCENARIO 5 (dead-end, UI) — the preview DOES surface the warning badge when
// every eligible day clashes. Room booked on all of Mon–Sat. Also asserts
// AR-RTL mirroring of the dialog when the locale is Arabic.
// ---------------------------------------------------------------------------
test('S5 — Auto dialog preview surfaces the conflict badge on a genuine dead-end', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win, roomId } = await bootSolverCenter();
  await blockRoomOnDays(win, roomId, [1, 2, 3, 4, 5, 6]); // every eligible (Mon–Sat) day blocked
  await gotoPlanning(win, L);

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = win.getByRole('dialog');

  if (locale() === 'ar') {
    const direction = await dialog.evaluate((el) => getComputedStyle(el).direction);
    expect(direction, 'AR renders RTL').toBe(DIRECTION.ar);
  }

  await switchGeneratorMode(dialog, G, 'auto');
  await setNumberField(dialog, 'sessionsPerWeek', 2);
  await setNumberField(dialog, 'minGapDays', 2);
  await fillGeneratorDateRange(dialog, '2026-08-10', '2026-08-31');
  await submitGeneratorConfig(dialog, G);

  // The warning badge/banner is surfaced (localized), yet commit stays the
  // admin's call (non-blocking) — the proposal is still shown.
  await expect(dialog.getByText(CONFLICT_BANNER_RE[locale()])).toBeVisible();
  await expect(dialog.getByRole('button', { name: G.commitAction, exact: true })).toBeVisible();
  expect(pageErrors).toHaveLength(0);
});

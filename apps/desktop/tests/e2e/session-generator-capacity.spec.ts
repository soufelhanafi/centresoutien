import { test, expect } from '@playwright/test';
import {
  boot,
  gotoPlanning,
  readWeek,
  STR,
  DIRECTION,
  type Launched,
  type Locale,
} from './planning-sessions.fixtures';
import {
  openGenerator,
  GENERATOR_STR,
  switchGeneratorMode,
  toggleWeekdayButton,
  fillGeneratorDateRange,
  submitGeneratorConfig,
} from './session-generator.fixtures';
import { CONFLICT_BANNER_RE } from './session-generator-random-solver.fixtures';
import {
  CAPACITY_STR,
  CAPACITY_COMMIT_ERROR_CODE,
  AUTO_CAPACITY_ERROR_CODE,
  previewCustom,
  commitProposals,
  commitProposalsExpectingError,
  previewAutoExpectingError,
  capacityConflicts,
  expandFirstProposal,
} from './session-generator-capacity.fixtures';

/**
 * SOU-275 — Custom-mode session generator, seat capacity.
 *
 * Background: SOU-272 made AUTO mode hard-fail when a group outgrows EVERY room.
 * SOU-275 handles CUSTOM mode: instead of crashing at commit, an undersized-room
 * block is surfaced on the preview as a NON-BLOCKING, NON-FORCEABLE "capacity"
 * conflict, and commit is refused for it with the stable IPC code
 * `schedule-capacity-conflict`.
 *
 * Black-box: driven through the running packaged app (public preload bridge +
 * the real generator dialog). No implementation is read or imported.
 *
 * ROOM_NAME carries no "Salle"/"القاعة" prefix so the localized warning
 * ("Salle {{room}} trop petite …") reads cleanly and the room name is uniquely
 * assertable as the block's attribution.
 */

const locale = () => test.info().project.name as Locale;
const ROOM_NAME = 'Alpha';
const OVERSIZED_GROUP = 30;
const ROOM_SEATS = 20;
const FITTING_GROUP = 10;
const MONDAY = 1;

let live: (Launched & { seeded: { rooms: { id: string; name: string }[]; groups: { id: string; level: string }[] } }) | null =
  null;
const pageErrors: Error[] = [];

test.afterEach(async () => {
  await live?.app.close();
  live = null;
  pageErrors.length = 0;
});

async function bootCenter(groupCapacity: number) {
  live = await boot(
    locale(),
    {
      rooms: [{ name: ROOM_NAME, capacity: ROOM_SEATS }],
      teachers: [{ nameFr: 'Prof Karim', nameAr: 'الأستاذ كريم', phone: '+212600112233' }],
      groups: [{ level: 'Groupe Math', capacity: groupCapacity, kind: 'regular' }],
    },
    'premium',
  );
  const win = live.win;
  win.on('pageerror', (err) => pageErrors.push(err));
  return { win, groupId: live.seeded.groups[0]!.id, roomId: live.seeded.rooms[0]!.id };
}

// ===========================================================================
// AC1 — DATA: a custom preview where the group outgrows every room surfaces a
// non-blocking `capacity` conflict that ATTRIBUTES the offending block (its
// group + its assigned room) with the seats-needed / seats-available counts.
// ===========================================================================
test('AC1 (data) — custom preview surfaces a capacity conflict attributing group + room + counts', async () => {
  const { win, groupId, roomId } = await bootCenter(OVERSIZED_GROUP);

  const result = await previewCustom(win, groupId, { pickedWeekdays: [MONDAY] });

  const caps = capacityConflicts(result);
  expect(caps, `expected a capacity conflict; got conflicts: ${JSON.stringify(result.conflicts)}`).toHaveLength(1);
  const cap = caps[0]!;
  expect(cap.groupId, 'conflict attributes the offending GROUP').toBe(groupId);
  expect(cap.roomId, 'conflict attributes the offending ROOM').toBe(roomId);
  expect(cap.groupCapacity, 'seats the group needs').toBe(OVERSIZED_GROUP);
  expect(cap.roomCapacity, 'seats the assigned room holds').toBe(ROOM_SEATS);
  // Non-blocking: a proposal for the block is still returned (never thrown away).
  expect(result.proposals, 'the block is still proposed (non-blocking)').toHaveLength(1);
  expect(pageErrors).toHaveLength(0);
});

// ===========================================================================
// AC1 — UI (FR-LTR + AR-RTL): the capacity warning renders with a REAL
// localized string (not a raw i18n key), names the room (attribution), shows
// the counts, and is rendered distinctly (its own non-forceable hint) from an
// ordinary forceable warning. AR run must be RTL.
// ===========================================================================
test('AC1 (UI) — capacity warning renders localized, attributes the room, distinct from forceable warnings', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const C = CAPACITY_STR[locale()];
  const { win } = await bootCenter(OVERSIZED_GROUP);
  await gotoPlanning(win, L);

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = win.getByRole('dialog');

  if (locale() === 'ar') {
    const direction = await dialog.evaluate((el) => getComputedStyle(el).direction);
    expect(direction, 'AR renders RTL').toBe(DIRECTION.ar);
  }

  await switchGeneratorMode(dialog, G, 'custom');
  await toggleWeekdayButton(dialog, G.pickedWeekdaysGroupLabel, L.weekdays[MONDAY]!);
  await fillGeneratorDateRange(dialog, '2026-08-10', '2026-08-31');
  await submitGeneratorConfig(dialog, G);

  // Non-blocking banner is shown.
  await expect(dialog.getByText(CONFLICT_BANNER_RE[locale()])).toBeVisible();

  // The per-block capacity warning: a real localized message (room name +
  // counts), NOT a raw i18n key.
  await expandFirstProposal(dialog);
  await expect(dialog.getByText(C.warning(ROOM_NAME, OVERSIZED_GROUP, ROOM_SEATS))).toBeVisible();
  await expect(dialog.getByText(C.rawKeyLeak), 'no raw i18n key leaks into the UI').toHaveCount(0);

  // Distinct from an ordinary forceable warning: the dedicated non-forceable
  // hint is shown (not the generic "decide per block" copy).
  await expect(dialog.getByText(C.blockedHint)).toBeVisible();

  expect(pageErrors).toHaveLength(0);
});

// ===========================================================================
// AC2 — UI: the admin can NEVER force-commit while a capacity conflict is
// present. The commit control is disabled, and there is NO per-block "include
// anyway" for a capacity conflict.
// ===========================================================================
test('AC2 (UI) — capacity conflict disables commit and offers no per-block force', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win } = await bootCenter(OVERSIZED_GROUP);
  await gotoPlanning(win, L);

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = win.getByRole('dialog');

  await switchGeneratorMode(dialog, G, 'custom');
  await toggleWeekdayButton(dialog, G.pickedWeekdaysGroupLabel, L.weekdays[MONDAY]!);
  await fillGeneratorDateRange(dialog, '2026-08-10', '2026-08-31');
  await submitGeneratorConfig(dialog, G);
  await expandFirstProposal(dialog);

  // Commit is blocked and stays blocked — no path to enable it.
  const commitButton = dialog.getByRole('button', { name: G.commitAction, exact: true });
  await expect(commitButton).toBeDisabled();

  // No "Inclure malgré le conflit" / "إدراجه رغم التعارض" force control exists
  // for a capacity block (unlike a room/teacher clash).
  await expect(
    dialog.getByRole('button', { name: G.conflictAction.include, exact: true }),
    'a capacity conflict must offer no per-block force',
  ).toHaveCount(0);

  expect(pageErrors).toHaveLength(0);
});

// ===========================================================================
// AC3 — DATA: attempting the commit with a capacity-overflow block (even with
// an explicit force flag) is rejected CLEANLY with the stable code
// `schedule-capacity-conflict` — only the `code` survives IPC, no uncaught throw
// / renderer crash.
// ===========================================================================
test('AC3 (data) — committing a capacity-overflow block is rejected with code schedule-capacity-conflict', async () => {
  const { win, groupId } = await bootCenter(OVERSIZED_GROUP);

  const preview = await previewCustom(win, groupId, { pickedWeekdays: [MONDAY] });
  expect(capacityConflicts(preview), 'precondition: preview carries the capacity conflict').toHaveLength(1);

  const before = await readWeek(win);
  const outcome = await commitProposalsExpectingError(win, preview.proposals);

  expect(
    outcome.code,
    `commit must reject with the stable capacity code (only the code survives IPC); raw: ${outcome.raw}`,
  ).toBe(CAPACITY_COMMIT_ERROR_CODE);

  // Rejected cleanly: nothing persisted, no renderer crash, no page error.
  expect(await readWeek(win), 'nothing is committed on a capacity rejection').toHaveLength(before.length);
  expect(pageErrors, 'no uncaught throw reaches the renderer').toHaveLength(0);
});

// ===========================================================================
// AC4 — SANITY (data): a normal custom run where the group fits the room shows
// NO capacity flag, previews clean, and commits fine.
// ===========================================================================
test('AC4 (data) — a fitting group previews with no capacity flag and commits successfully', async () => {
  const { win, groupId } = await bootCenter(FITTING_GROUP);

  const preview = await previewCustom(win, groupId, { pickedWeekdays: [MONDAY] });
  expect(capacityConflicts(preview), 'no false capacity flag when the group fits').toHaveLength(0);
  expect(preview.proposals, 'a proposal is produced').toHaveLength(1);

  const result = await commitProposals(win, preview.proposals);
  expect(result.templates.length, 'the run commits at least one template').toBeGreaterThan(0);
  expect((await readWeek(win)).length, 'committed sessions are persisted').toBeGreaterThan(0);
  expect(pageErrors).toHaveLength(0);
});

// ===========================================================================
// AC5 — REGRESSION (data): AUTO mode still fails fast — a group larger than
// every room surfaces `group-exceeds-room-capacity` on preview (SOU-272).
// ===========================================================================
test('AC5 (data) — auto mode fails fast with group-exceeds-room-capacity on an oversized group', async () => {
  const { win, groupId } = await bootCenter(OVERSIZED_GROUP);

  const outcome = await previewAutoExpectingError(win, groupId);

  expect(
    outcome.code,
    `auto mode must fast-fail with the stable code; raw: ${outcome.raw}`,
  ).toBe(AUTO_CAPACITY_ERROR_CODE);
  expect(pageErrors).toHaveLength(0);
});

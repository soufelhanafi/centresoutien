import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
} from '../../../src/services/session-generator';
import { satisfiesMinGap } from '../../../src/policies/weekday-gap';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { GroupId } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeeklyBlock } from '../../../src/value-objects/weekly-block';
import { fakeRandom, sequenceRandom } from '../fakes/random';

const SUN = 0 as WeekdayIndex;
const MON = 1 as WeekdayIndex;
const TUE = 2 as WeekdayIndex;
const WED = 3 as WeekdayIndex;
const THU = 4 as WeekdayIndex;
const FRI = 5 as WeekdayIndex;
const SAT = 6 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;

const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const ROOM_C = 'rom_00000000000000000000000003' as RoomId;

const TEACHER_1 = 'tch_00000000000000000000000001' as EntityId;

/** Center open 09:00–18:00 Mon–Sat; Sunday closed. */
const centerHours: readonly DayHours[] = [
  { dayOfWeek: SUN, windows: [] },
  ...[MON, TUE, WED, THU, FRI, SAT].map((dayOfWeek) => ({
    dayOfWeek,
    windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }],
  })),
];

function autoConfig(over: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular',
    weekdayPool: [MON, TUE, WED, THU, FRI, SAT],
    sessionsPerWeek: 2,
    minGapDays: 2,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...over,
  } as SessionGeneratorConfig;
}

function input(
  config: SessionGeneratorConfig,
  groups: readonly GroupId[],
  options: { existingSchedule?: readonly ScheduledSessionRef[]; rooms?: readonly RoomId[] } = {},
): SessionGenerationInput {
  return {
    config,
    groups,
    teacherByGroup: new Map(),
    rooms: options.rooms ?? [ROOM_A],
    centerHours,
    existingSchedule: options.existingSchedule ?? [],
  };
}

/** Occupies the single room on `day` from open for 90 minutes — the slot the generator would anchor to. */
function roomTakenOn(day: WeekdayIndex): ScheduledSessionRef {
  return { id: `ses_${day}` as EntityId, roomId: ROOM_A, dayOfWeek: day, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay };
}

function blockDays(proposal: { blocks: readonly { block: WeeklyBlock }[] }): readonly WeekdayIndex[] {
  return proposal.blocks.map((scheduled) => scheduled.block.dayOfWeek);
}

describe('SessionGenerator — exhaustive conflict-free day search (SOU-182)', () => {
  it('skips the first min-gap combo when it clashes and commits a later conflict-free one', () => {
    const generator = new SessionGenerator(fakeRandom());
    // Identity shuffle scans in pool order; {Mon,Wed} is the first min-gap combo — the room is busy on Monday.
    const existing = [roomTakenOn(MON)];

    const { proposals, conflicts } = generator.generate(input(autoConfig(), [G1], { existingSchedule: existing }));

    expect(blockDays(proposals[0]!)).not.toContain(MON);
    expect(satisfiesMinGap(blockDays(proposals[0]!), 2)).toBe(true);
    expect(conflicts).toEqual([]);
  });

  it('still reports a conflict when every valid combo is a dead-end (room busy on every eligible day)', () => {
    const generator = new SessionGenerator(fakeRandom());
    const existing = [MON, TUE, WED, THU, FRI, SAT].map(roomTakenOn);

    const { proposals, conflicts } = generator.generate(input(autoConfig(), [G1], { existingSchedule: existing }));

    // The proposal is never dropped — the dead-end still commits the first valid combo.
    expect(proposals[0]!.blocks).toHaveLength(2);
    expect(conflicts.some((c) => c.kind === 'room')).toBe(true);
  });

  it('finds a clean combo for a 3-sessions-per-week run around a blocked day', () => {
    const generator = new SessionGenerator(fakeRandom());
    const config = autoConfig({ sessionsPerWeek: 3, minGapDays: 2 });
    const existing = [roomTakenOn(MON)];

    const { proposals, conflicts } = generator.generate(input(config, [G1], { existingSchedule: existing }));

    expect(proposals[0]!.blocks).toHaveLength(3);
    expect(blockDays(proposals[0]!)).not.toContain(MON);
    expect(satisfiesMinGap(blockDays(proposals[0]!), 2)).toBe(true);
    expect(conflicts).toEqual([]);
  });

  it('places a second group off the first group’s slot when an alternative exists (greedy sibling avoidance)', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals, conflicts } = generator.generate(input(autoConfig(), [G1, G2]));

    const daysG1 = new Set(blockDays(proposals[0]!));
    const overlap = blockDays(proposals[1]!).filter((day) => daysG1.has(day));
    expect(overlap).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it('leaves the first-choice combo untouched when it is already conflict-free', () => {
    const generator = new SessionGenerator(fakeRandom());

    const { proposals, conflicts } = generator.generate(input(autoConfig({ weekdayPool: [MON, TUE, WED, THU, FRI] }), [G1]));

    // Nothing to avoid → the deterministic first min-gap combo {Mon,Wed} is committed as before.
    expect(blockDays(proposals[0]!)).toEqual([MON, WED]);
    expect(conflicts).toEqual([]);
  });
});

describe('SessionGenerator — run-wide final rooming (SOU-182)', () => {
  // Regression guard for the reviewer's finding: the per-group day search must
  // not be the last word on rooms. After every group commits its weekday combo,
  // one run-wide pass re-rooms all committed blocks together, so
  // `linkBackToBackChains` — the same-teacher back-to-back room-continuity rule —
  // sees every group's blocks at once and can span groups. Per-group final
  // rooming (the regression) could never form a cross-group chain.
  it('re-rooms every committed block in one run-wide pass, not group by group', () => {
    // Two groups share one teacher and one weekday, pinned via custom mode so
    // the run draws no shuffle randomness and every draw is a room draw in a
    // fixed order. The per-group day search rooms each group provisionally
    // (draws #1 → rooms[0], #2 → rooms[0]); the run-wide final pass then re-rooms
    // the whole run together (draws #3 → rooms[1] for group 1, #4 → rooms[2] for
    // group 2). The result carrying the run-wide draws (ROOM_B, ROOM_C) rather
    // than the search draws (both ROOM_A) is what proves the final rooming is a
    // single pass over every group. The continuity rule itself is covered by the
    // assignRoomsToBlocks unit tests; it cannot fire through generate() because
    // every block anchors at its weekday's one opening time, so two groups on a
    // weekday overlap rather than sit back-to-back.
    const generator = new SessionGenerator(sequenceRandom([0, 0, 1, 2]));
    const config = {
      scope: { groups: 'all', teachers: 'all' },
      kind: 'regular',
      weekdayPool: [MON],
      sessionsPerWeek: 1,
      minGapDays: 1,
      sessionDurationMinutes: 90,
      range: { startDate: '2026-09-01', endDate: '2026-12-31' },
      mode: 'custom',
      pickedWeekdays: [MON],
    } as SessionGeneratorConfig;
    const runInput: SessionGenerationInput = {
      config,
      groups: [G1, G2],
      teacherByGroup: new Map([
        [G1, TEACHER_1],
        [G2, TEACHER_1],
      ]),
      rooms: [ROOM_A, ROOM_B, ROOM_C],
      centerHours,
      existingSchedule: [],
    };

    const { proposals } = generator.generate(runInput);

    expect(proposals[0]!.blocks[0]!.roomId).toBe(ROOM_B);
    expect(proposals[1]!.blocks[0]!.roomId).toBe(ROOM_C);
  });
});

import { describe, it, expect } from 'vitest';
import {
  blockKey,
  buildCommitProposals,
  conflictingBlockKeys,
  type BlockResolution,
} from '../../../src/renderer/lib/planning/session-generator-view';
import type {
  GeneratorBlockProposal,
  GeneratorPreviewResult,
} from '../../../src/renderer/lib/planning/session-generator-gateway';

function block(over: Partial<GeneratorBlockProposal> = {}): GeneratorBlockProposal {
  return { dayOfWeek: 1, start: '09:00', end: '10:00', roomId: 'room_a', teacherId: null, ...over };
}

function result(over: Partial<GeneratorPreviewResult> = {}): GeneratorPreviewResult {
  return {
    proposals: [{ groupId: 'group_1', blocks: [block()], gapViolations: [] }],
    conflicts: [],
    ...over,
  };
}

describe('conflictingBlockKeys', () => {
  it('marks a block whose exact slot matches a center-hours conflict', () => {
    const preview = result({
      conflicts: [
        { kind: 'hours', groupId: 'group_1', dayOfWeek: 1, start: '09:00', end: '10:00', reason: 'after-close', open: '08:00', close: '09:30' },
      ],
    });
    expect([...conflictingBlockKeys(preview)]).toEqual([blockKey('group_1', block())]);
  });

  it('leaves a same-weekday block on a different slot clean', () => {
    const preview = result({
      proposals: [
        {
          groupId: 'group_1',
          blocks: [block({ start: '09:00', end: '10:00' }), block({ start: '11:00', end: '12:00' })],
          gapViolations: [],
        },
      ],
      conflicts: [
        { kind: 'hours', groupId: 'group_1', dayOfWeek: 1, start: '11:00', end: '12:00', reason: 'after-close', open: '08:00', close: '11:30' },
      ],
    });
    expect([...conflictingBlockKeys(preview)]).toEqual([
      blockKey('group_1', block({ start: '11:00', end: '12:00' })),
    ]);
  });

  it('marks a block only when the exact slot AND room match a room double-booking', () => {
    const preview = result({
      proposals: [
        {
          groupId: 'group_1',
          blocks: [block({ roomId: 'room_a' }), block({ roomId: 'room_b' })],
          gapViolations: [],
        },
      ],
      conflicts: [
        { kind: 'room', groupId: 'group_1', roomId: 'room_a', dayOfWeek: 1, start: '09:00', end: '10:00', conflicts: [] },
      ],
    });
    expect([...conflictingBlockKeys(preview)]).toEqual([blockKey('group_1', block({ roomId: 'room_a' }))]);
  });

  it('marks a block only when the exact slot and teacher match a teacher double-booking', () => {
    const preview = result({
      proposals: [
        {
          groupId: 'group_1',
          blocks: [
            block({ teacherId: 'teacher_a' }),
            block({ start: '09:30', end: '10:30', teacherId: 'teacher_a' }),
            block({ teacherId: 'teacher_b' }),
          ],
          gapViolations: [],
        },
      ],
      conflicts: [
        {
          kind: 'teacher',
          groupId: 'group_1',
          teacherId: 'teacher_a',
          dayOfWeek: 1,
          start: '09:00',
          end: '10:00',
          conflicts: [],
        },
      ],
    });
    expect([...conflictingBlockKeys(preview)]).toEqual([blockKey('group_1', block({ teacherId: 'teacher_a' }))]);
  });

  it('leaves a clean run with no conflicting blocks', () => {
    expect(conflictingBlockKeys(result()).size).toBe(0);
  });
});

describe('buildCommitProposals', () => {
  const clashing = result({
    proposals: [
      {
        groupId: 'group_1',
        blocks: [block({ start: '09:00' }), block({ start: '11:00' })],
        gapViolations: [],
      },
    ],
    conflicts: [
      { kind: 'hours', groupId: 'group_1', dayOfWeek: 1, start: '09:00', end: '10:00', reason: 'after-close', open: '08:00', close: '09:30' },
    ],
  });

  it('forces a decided-in clashing block and keeps clean blocks unforced', () => {
    const resolve = (_g: string, b: GeneratorBlockProposal): BlockResolution =>
      b.start === '09:00' ? 'forced' : 'clean';
    const proposals = buildCommitProposals(clashing.proposals, resolve);
    expect(proposals).toEqual([
      {
        groupId: 'group_1',
        blocks: [
          { dayOfWeek: 1, start: '09:00', end: '10:00', roomId: 'room_a', allowScheduleConflict: true },
          { dayOfWeek: 1, start: '11:00', end: '10:00', roomId: 'room_a', allowScheduleConflict: false },
        ],
      },
    ]);
  });

  it('drops excluded blocks and omits a group left with none', () => {
    const proposals = buildCommitProposals(clashing.proposals, () => 'excluded');
    expect(proposals).toEqual([]);
  });
});

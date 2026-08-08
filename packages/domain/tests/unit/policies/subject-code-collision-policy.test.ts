import { describe, it, expect } from 'vitest';
import { resolveSubjectCodeCollision } from '../../../src/policies/subject-code-collision-policy';
import type { EntityId } from '../../../src/value-objects/ids';

const LO = 'sub_00000000000000000000000001' as EntityId;
const HI = 'sub_00000000000000000000000002' as EntityId;

describe('resolveSubjectCodeCollision — lower ULID wins, clock-independent', () => {
  it('keeps the code on the lower ULID regardless of argument order', () => {
    expect(resolveSubjectCodeCollision(LO, HI)).toEqual({ winnerId: LO, loserId: HI });
    expect(resolveSubjectCodeCollision(HI, LO)).toEqual({ winnerId: LO, loserId: HI });
  });

  it('is deterministic — the same pair always yields the same winner', () => {
    const first = resolveSubjectCodeCollision(HI, LO);
    const second = resolveSubjectCodeCollision(LO, HI);
    expect(first).toEqual(second);
  });
});

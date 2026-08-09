import { act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGeneratorDecisions } from '../../../src/renderer/hooks/planning/use-generator-decisions';
import type {
  GeneratorBlockProposal,
  GeneratorPreviewResult,
} from '../../../src/renderer/lib/planning/session-generator-gateway';

function block(over: Partial<GeneratorBlockProposal> = {}): GeneratorBlockProposal {
  return { dayOfWeek: 1, start: '09:00', end: '10:00', roomId: 'room_a', ...over };
}

const clashingPreview: GeneratorPreviewResult = {
  proposals: [{ groupId: 'group_1', blocks: [block()], gapViolations: [] }],
  conflicts: [
    { kind: 'hours', groupId: 'group_1', dayOfWeek: 1, start: '09:00', end: '10:00', reason: 'after-close', open: '08:00', close: '09:30' },
  ],
};

const cleanPreview: GeneratorPreviewResult = {
  proposals: [{ groupId: 'group_1', blocks: [block()], gapViolations: [] }],
  conflicts: [],
};

describe('useGeneratorDecisions commit gate', () => {
  it('keeps allDecided false while a conflicting block is undecided', () => {
    const { result } = renderHook(() => useGeneratorDecisions(clashingPreview));
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.allDecided).toBe(false);
  });

  it('flips allDecided true once the conflicting block is forced', () => {
    const { result } = renderHook(() => useGeneratorDecisions(clashingPreview));

    act(() => result.current.setDecision('group_1', block(), 'forced'));

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.allDecided).toBe(true);
  });

  it('flips allDecided true once the conflicting block is excluded', () => {
    const { result } = renderHook(() => useGeneratorDecisions(clashingPreview));

    act(() => result.current.setDecision('group_1', block(), 'excluded'));

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.allDecided).toBe(true);
  });

  it('reports allDecided true for a preview with no conflicts', () => {
    const { result } = renderHook(() => useGeneratorDecisions(cleanPreview));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.allDecided).toBe(true);
  });
});

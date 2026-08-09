import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GeneratorBlockProposal,
  GeneratorPreviewResult,
} from '../../lib/planning/session-generator-gateway';
import { blockKey, conflictingBlockKeys } from '../../lib/planning/session-generator-view';

/** One conflicting block's scoped decision: force it in, or drop it from the batch. */
export type BlockDecision = 'forced' | 'excluded';

export type GeneratorDecisions = {
  isConflicting: (groupId: string, block: GeneratorBlockProposal) => boolean;
  decisionFor: (groupId: string, block: GeneratorBlockProposal) => BlockDecision | undefined;
  setDecision: (groupId: string, block: GeneratorBlockProposal, decision: BlockDecision) => void;
  pendingCount: number;
  allDecided: boolean;
};

/**
 * Holds the admin's per-block include/exclude decisions for a preview (SOU-183).
 * Every edit is scoped to a single block — nothing here re-runs the preview, so
 * deciding one clash never reshuffles already-clean groups. The map resets when a
 * fresh preview arrives. `allDecided` gates the commit button: it is `true` only
 * once every conflicting block has an explicit decision.
 */
export function useGeneratorDecisions(result: GeneratorPreviewResult): GeneratorDecisions {
  const conflicting = useMemo(() => conflictingBlockKeys(result), [result]);
  const [decisions, setDecisions] = useState<ReadonlyMap<string, BlockDecision>>(() => new Map());

  useEffect(() => setDecisions(new Map()), [result]);

  const isConflicting = useCallback(
    (groupId: string, block: GeneratorBlockProposal) => conflicting.has(blockKey(groupId, block)),
    [conflicting],
  );

  const decisionFor = useCallback(
    (groupId: string, block: GeneratorBlockProposal) => decisions.get(blockKey(groupId, block)),
    [decisions],
  );

  const setDecision = useCallback(
    (groupId: string, block: GeneratorBlockProposal, decision: BlockDecision) =>
      setDecisions((prev) => new Map(prev).set(blockKey(groupId, block), decision)),
    [],
  );

  const pendingCount = useMemo(() => {
    let pending = 0;
    for (const key of conflicting) if (!decisions.has(key)) pending += 1;
    return pending;
  }, [conflicting, decisions]);

  return { isConflicting, decisionFor, setDecision, pendingCount, allDecided: pendingCount === 0 };
}

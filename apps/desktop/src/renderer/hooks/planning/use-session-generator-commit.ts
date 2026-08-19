import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useCommitSchedule } from './use-commit-schedule';
import { useGeneratorDecisions } from './use-generator-decisions';
import {
  buildCommitProposals,
  hasCapacityConflict,
  type BlockResolution,
} from '../../lib/planning/session-generator-view';
import { mapGeneratorError } from '../../lib/planning/session-generator-error';
import type {
  GeneratorBlockProposal,
  GeneratorPreviewResult,
  GeneratorRange,
} from '../../lib/planning/session-generator-gateway';

const EMPTY_PREVIEW_RESULT: GeneratorPreviewResult = { proposals: [], conflicts: [] };

/**
 * Turns a preview + the admin's per-block decisions into a scoped commit
 * (SOU-183). `canCommit` stays `false` until every conflicting block has an
 * explicit include/exclude decision; `runCommit` drops excluded blocks, forces
 * the rest, and persists — nothing here re-runs the preview, so a decision never
 * reshuffles already-clean groups.
 */
export function useSessionGeneratorCommit(previewResult: GeneratorPreviewResult | undefined) {
  const { t } = useTranslation();
  const commit = useCommitSchedule();
  const decisions = useGeneratorDecisions(previewResult ?? EMPTY_PREVIEW_RESULT);

  const { isConflicting, decisionFor } = decisions;
  const proposals = useMemo(() => {
    if (!previewResult) return [];
    const resolveBlock = (groupId: string, block: GeneratorBlockProposal): BlockResolution => {
      if (!isConflicting(groupId, block)) return 'clean';
      return decisionFor(groupId, block) === 'excluded' ? 'excluded' : 'forced';
    };
    return buildCommitProposals(previewResult.proposals, resolveBlock);
  }, [previewResult, isConflicting, decisionFor]);
  // A seat-overflow conflict (SOU-275) is non-forceable: it would throw at commit,
  // so its mere presence disables commit outright — the admin must fix the room
  // assignment and re-preview, no per-block override can let it through.
  const capacityBlocked = hasCapacityConflict((previewResult ?? EMPTY_PREVIEW_RESULT).conflicts);
  // Enabled once every clash is decided — NOT gated on a non-empty batch: a run
  // whose every conflicting block was excluded resolves to zero proposals yet
  // must still be completable (SOU-183), so the final action closes the dialog
  // rather than dead-ending with a disabled button and no hint.
  const canCommit = decisions.allDecided && !capacityBlocked && !commit.isPending;

  const runCommit = async (input: {
    range: GeneratorRange;
    mode: 'auto' | 'custom';
    onCommitted: () => void;
  }) => {
    if (proposals.length === 0) {
      input.onCommitted();
      return;
    }
    try {
      const result = await commit.mutateAsync({ mode: input.mode, proposals, range: input.range });
      const created = result.templates.length;
      const skipped = result.templates.reduce((sum, template) => sum + template.skippedHolidays.length, 0);
      toast.success(t('planning.generator.commitSuccess', { count: created }));
      if (skipped > 0) toast.warning(t('planning.generator.commitSkipped', { count: skipped }));
      input.onCommitted();
    } catch (error) {
      const code = mapGeneratorError(error);
      toast.error(code ? t(`errors.${code}`) : t('planning.generator.error'));
    }
  };

  return {
    decisions,
    canCommit,
    capacityBlocked,
    isCommitting: commit.isPending,
    runCommit,
    resetCommit: commit.reset,
  };
}

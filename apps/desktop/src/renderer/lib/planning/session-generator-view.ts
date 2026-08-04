import type {
  GeneratorCommitInput,
  GeneratorConflict,
  GeneratorGroupProposal,
  GeneratorRange,
} from './session-generator-gateway';

/**
 * How many dated occurrences a single weekly block materializes over `range`.
 * For the `occurrenceCount` window that count is exactly the target. For a
 * `[startDate, endDate]` window it is the number of that weekday between the
 * bounds (inclusive). This is an **upper bound** shown in the preview: the
 * commit step still skips dates that fall on a configured holiday (surfaced in
 * the commit result's `skippedHolidays`), which the dry-run preview cannot see.
 */
function occurrencesOfWeekday(dayOfWeek: number, range: GeneratorRange): number {
  if ('occurrenceCount' in range) return range.occurrenceCount;
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getDay() === dayOfWeek) count += 1;
  }
  return count;
}

/**
 * The preview headline figures: how many dated sessions the run would create
 * (summed across every group's every block over the window) and how many groups
 * receive at least one block. `sessions` is an upper bound — holidays are only
 * skipped at commit time — so the UI labels it as an estimate.
 */
export function summarizeProposals(
  proposals: readonly GeneratorGroupProposal[],
  range: GeneratorRange,
): { readonly sessions: number; readonly groups: number } {
  let sessions = 0;
  let groups = 0;
  for (const proposal of proposals) {
    if (proposal.blocks.length > 0) groups += 1;
    for (const block of proposal.blocks) {
      sessions += occurrencesOfWeekday(block.dayOfWeek, range);
    }
  }
  return { sessions, groups };
}

/** Buckets the run's non-blocking conflicts by the group they belong to, for per-group display. */
export function conflictsByGroup(
  conflicts: readonly GeneratorConflict[],
): ReadonlyMap<string, readonly GeneratorConflict[]> {
  const byGroup = new Map<string, GeneratorConflict[]>();
  for (const conflict of conflicts) {
    const bucket = byGroup.get(conflict.groupId);
    if (bucket === undefined) byGroup.set(conflict.groupId, [conflict]);
    else bucket.push(conflict);
  }
  return byGroup;
}

/**
 * Strips the preview proposals down to the commit request's `proposals` shape:
 * `gapViolations` was informational only (the domain re-derives nothing from it)
 * and blocks with no room are dropped since the commit schema requires at least
 * one block per proposal. A proposal left with zero blocks is omitted entirely.
 */
export function toCommitProposals(
  proposals: readonly GeneratorGroupProposal[],
): GeneratorCommitInput['proposals'] {
  return proposals
    .filter((proposal) => proposal.blocks.length > 0)
    .map((proposal) => ({
      groupId: proposal.groupId,
      blocks: proposal.blocks.map((block) => ({
        dayOfWeek: block.dayOfWeek,
        start: block.start,
        end: block.end,
        roomId: block.roomId,
      })),
    }));
}

import type {
  GeneratorBlockProposal,
  GeneratorCommitInput,
  GeneratorConflict,
  GeneratorGroupProposal,
  GeneratorPreviewResult,
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

/**
 * Whether the run surfaced any seat-overflow conflict (SOU-275): a group assigned
 * a room too small to seat it. Seat overflow would throw `GroupOverCapacityError`
 * at commit, so — unlike a forceable schedule double-book — its presence disables
 * commit entirely. The admin must fix the room/config and re-preview.
 */
export function hasCapacityConflict(conflicts: readonly GeneratorConflict[]): boolean {
  return conflicts.some((conflict) => conflict.kind === 'capacity');
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

/** A stable identity for one proposed block within its group (weekday + slot + room). */
export function blockKey(groupId: string, block: GeneratorBlockProposal): string {
  return `${groupId}|${block.dayOfWeek}|${block.start}|${block.end}|${block.roomId}|${block.teacherId ?? 'none'}`;
}

function blockMatchesAnyConflict(
  block: GeneratorBlockProposal,
  conflicts: readonly GeneratorConflict[],
): boolean {
  return conflicts.some((conflict) => {
    // A capacity conflict (SOU-275) is never forceable, so it never marks a block
    // as decidable (include/exclude): it blocks the whole commit instead.
    if (conflict.kind === 'capacity') return false;
    if (conflict.dayOfWeek !== block.dayOfWeek) return false;
    if (conflict.kind === 'teacher' || conflict.kind === 'teacher-availability') {
      return (
        block.teacherId === conflict.teacherId &&
        conflict.start === block.start &&
        conflict.end === block.end
      );
    }
    return (
      conflict.start === block.start &&
      conflict.end === block.end &&
      (conflict.kind === 'hours' || conflict.kind === 'student' || conflict.roomId === block.roomId)
    );
  });
}

/**
 * The keys of every block that clashes (SOU-183): a block is conflicting when a
 * conflict in its group matches its exact slot (weekday + start + end) — plus its
 * room for a double-booking, with no room to match for a center-hours overrun.
 * Only these blocks need an explicit include/exclude decision before the run can
 * be committed.
 */
export function conflictingBlockKeys(result: GeneratorPreviewResult): ReadonlySet<string> {
  const byGroup = conflictsByGroup(result.conflicts);
  const keys = new Set<string>();
  for (const proposal of result.proposals) {
    const conflicts = byGroup.get(proposal.groupId);
    if (conflicts === undefined) continue;
    for (const block of proposal.blocks) {
      if (blockMatchesAnyConflict(block, conflicts)) keys.add(blockKey(proposal.groupId, block));
    }
  }
  return keys;
}

/** The commit disposition of one block (SOU-183): clean, force-included, or excluded. */
export type BlockResolution = 'clean' | 'forced' | 'excluded';

/**
 * Builds the commit request's `proposals` from the preview and the admin's
 * per-block decisions (SOU-183): excluded blocks are dropped, forced blocks carry
 * `allowScheduleConflict: true`, clean blocks `false`, and `gapViolations` (only
 * informational) is stripped. A proposal left with zero blocks is omitted so a
 * group whose every block was excluded never reaches the write path.
 */
export function buildCommitProposals(
  proposals: readonly GeneratorGroupProposal[],
  resolve: (groupId: string, block: GeneratorBlockProposal) => BlockResolution,
): GeneratorCommitInput['proposals'] {
  const result: GeneratorCommitInput['proposals'] = [];
  for (const proposal of proposals) {
    const blocks = proposal.blocks
      .filter((block) => resolve(proposal.groupId, block) !== 'excluded')
      .map((block) => ({
        dayOfWeek: block.dayOfWeek,
        start: block.start,
        end: block.end,
        roomId: block.roomId,
        allowScheduleConflict: resolve(proposal.groupId, block) === 'forced',
      }));
    if (blocks.length > 0) result.push({ groupId: proposal.groupId, blocks });
  }
  return result;
}

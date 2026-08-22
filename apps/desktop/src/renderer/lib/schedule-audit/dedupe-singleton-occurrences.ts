import type { StrandedGroupView } from './stranded-session-view';

/**
 * A multi-reason occurrence belongs to one group per reason (SOU-296). When each
 * of those groups holds only that one occurrence, the list would render the same
 * dated row once per reason — indistinguishable duplicates, each with its own
 * cancel action for the same `ses_` id. Collapse them: the first group for a
 * given session id renders (its row shows the occurrence's full `reasons`), and
 * every later singleton group for the same id is dropped.
 *
 * Collapsed groups (`count > 1`) are never merged — a room double-book and a
 * teacher double-book of the same occurrence are two distinct root causes and
 * stay two cards, matching the domain's per-reason grouping.
 */
export function dedupeSingletonOccurrences(
  groups: readonly StrandedGroupView[],
): readonly StrandedGroupView[] {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (group.count !== 1) return true;
    const id = group.occurrences[0]!.session.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

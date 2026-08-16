import type { SessionAuditReason, StrandedSessionView } from './stranded-session-view';

/**
 * One structural audit problem (SOU-262): every stranded occurrence of a single
 * recurring template that shares one reason, in ascending date order. A group of
 * one is a genuinely dated case (e.g. only the week a holiday shifted) and the
 * list renders it as a plain row; a larger group is the "same collision every
 * week" case collapsed to one card with a ×N badge.
 */
export type StrandedGroup = {
  readonly key: string;
  readonly reason: SessionAuditReason;
  readonly occurrences: readonly StrandedSessionView[];
};

/**
 * Collapses the audit's per-date rows into structural problems, keyed by
 * `(recurringSessionId, reason)` — the template identity, not a weekday/slot
 * heuristic, so two templates sharing a slot never merge and a template
 * stranded for two different reasons (some dates on holiday, others outside
 * hours) stays two honestly-badged groups. The ×N count is the number of
 * occurrences actually stranded, so weeks a holiday already clears are never
 * counted. Groups order by their earliest date (then key), occurrences by date
 * — both deterministic for a stable list across refetches.
 */
export function groupStrandedSessions(
  stranded: readonly StrandedSessionView[],
): readonly StrandedGroup[] {
  const byKey = new Map<string, StrandedSessionView[]>();
  for (const item of stranded) {
    const key = `${item.session.recurringSessionId}|${item.reason}`;
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, [item]);
    else bucket.push(item);
  }

  const groups = [...byKey.entries()].map(([key, occurrences]) => ({
    key,
    reason: occurrences[0]!.reason,
    occurrences: [...occurrences].sort((a, b) => a.session.date.localeCompare(b.session.date)),
  }));
  return groups.sort((a, b) => {
    const firstA = a.occurrences[0]!.session.date;
    const firstB = b.occurrences[0]!.session.date;
    return firstA !== firstB ? firstA.localeCompare(firstB) : a.key.localeCompare(b.key);
  });
}

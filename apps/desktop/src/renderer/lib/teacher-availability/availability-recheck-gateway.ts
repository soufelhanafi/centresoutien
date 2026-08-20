import { ipcAvailabilityRecheckGateway } from './ipc-availability-recheck-gateway';

/** A bilingual `{ fr, ar }` label, the shape `localizedText` consumes. */
export type BilingualText = { readonly fr: string; readonly ar: string };

/**
 * One existing weekly session that a just-saved teacher availability change now
 * places outside the teacher's declared windows (SOU-283). A projection of the
 * domain re-check row (`WeeklySessionDto`): the recurring slot's identity plus
 * the enriched labels the summary popup shows (never re-joined in the renderer).
 * `subjectName` / `teacherName` degrade to `null` for an archived or
 * not-yet-synced reference rather than dropping the row — a session is labelled
 * by its subject here, exactly as the sessions sidebar labels it.
 */
export type OutOfWindowSessionView = {
  readonly sessionId: string;
  readonly subjectName: BilingualText | null;
  readonly teacherName: BilingualText | null;
  /** `0..6`, Sunday-based, matching `planning.weekdays.*`. */
  readonly dayOfWeek: number;
  /** `'HH:mm'` wall-clock start/end, not timestamps. */
  readonly start: string;
  readonly end: string;
};

// One dated occurrence a just-saved one-off absence now covers (SOU-287) — the
// exception-save sibling of OutOfWindowSessionView. Carries the concrete civil
// `date` (instead of a weekday) so the popup can show when the stranded
// occurrence actually happens.
export type OutOfWindowOccurrenceView = {
  readonly sessionId: string;
  readonly subjectName: BilingualText | null;
  readonly teacherName: BilingualText | null;
  // Materialized occurrence, strict `'YYYY-MM-DD'`.
  readonly date: string;
  // `'HH:mm'` wall-clock start/end, not timestamps.
  readonly start: string;
  readonly end: string;
};

// The two drift kinds one re-check reports (SOU-287).
export type AvailabilityRecheckResult = {
  readonly sessions: readonly OutOfWindowSessionView[];
  readonly occurrences: readonly OutOfWindowOccurrenceView[];
};

// The seam the post-save availability re-check depends on (Dependency Inversion):
// given the teacher whose availability (weekly windows OR an absence) was just
// saved, return the sessions that became out-of-window / exception-covered. The
// hook calls this interface, never `window.api` directly, so the concrete IPC
// adapter drops in one place with no change to the popup. Contract-first
// (SOU-283, SOU-287): the re-check is non-blocking — the save already succeeded;
// this only surfaces the drift, and an empty result never opens the popup.
export interface AvailabilityRecheckGateway {
  listOutOfWindowSessions(teacherId: string): Promise<AvailabilityRecheckResult>;
}

/** The active gateway: the real IPC adapter over `teacherAvailability.recheckSessions`. */
export const availabilityRecheckGateway: AvailabilityRecheckGateway = ipcAvailabilityRecheckGateway;

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

/**
 * The seam the post-save availability re-check depends on (Dependency Inversion):
 * given the teacher whose week was just saved, return the sessions that became
 * out-of-window. The hook calls this interface, never `window.api` directly, so
 * the concrete IPC adapter drops in one place with no change to the popup.
 *
 * Contract-first (SOU-283): the re-check is non-blocking — the save already
 * succeeded; this only surfaces the drift for the admin to review and decide
 * later. An empty result means nothing was stranded and the popup never opens.
 */
export interface AvailabilityRecheckGateway {
  listOutOfWindowSessions(teacherId: string): Promise<readonly OutOfWindowSessionView[]>;
}

/** The active gateway: the real IPC adapter over `teacherAvailability.recheckSessions`. */
export const availabilityRecheckGateway: AvailabilityRecheckGateway = ipcAvailabilityRecheckGateway;

/** A bilingual `{ fr, ar }` label, the shape `localizedText` consumes. */
export type BilingualText = { readonly fr: string; readonly ar: string };

/**
 * One existing weekly session that a just-saved teacher availability change now
 * places outside the teacher's declared windows (SOU-283). The mirror of the
 * domain re-check row: the recurring slot's identity plus the enriched labels the
 * summary popup shows (never re-joined in the renderer). `groupName` / `teacherName`
 * degrade to `null` for an archived or not-yet-synced reference rather than
 * dropping the row.
 */
export type OutOfWindowSessionView = {
  readonly sessionId: string;
  readonly groupName: BilingualText | null;
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
 * the real IPC adapter drops in one place with no change to the popup.
 *
 * Contract-first (SOU-283): the re-check is non-blocking — the save already
 * succeeded; this only surfaces the drift for the admin to review and decide
 * later. An empty result means nothing was stranded and the popup never opens.
 */
export interface AvailabilityRecheckGateway {
  listOutOfWindowSessions(teacherId: string): Promise<readonly OutOfWindowSessionView[]>;
}

/**
 * Mock adapter (SOU-283): reports no stranded sessions so the popup stays dormant
 * until the domain re-check ships. It stands behind the same interface as the real
 * IPC adapter will, so wiring, the hook, and the popup are all exercised now.
 *
 * TODO(SOU-283): swap this mock for the real preload channel once the domain
 * branch merges — the backend may deliver the re-check either as a dedicated
 * channel (e.g. `teacherAvailability.recheck`) or as an extra field on the
 * existing `teacherAvailability.save` response. Either way the swap is this one
 * export; the hook and popup do not change.
 */
class MockAvailabilityRecheckGateway implements AvailabilityRecheckGateway {
  async listOutOfWindowSessions(teacherId: string): Promise<readonly OutOfWindowSessionView[]> {
    void teacherId;
    return [];
  }
}

export const availabilityRecheckGateway: AvailabilityRecheckGateway =
  new MockAvailabilityRecheckGateway();

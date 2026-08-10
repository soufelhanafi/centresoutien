/**
 * Thrown when roll-call asks to materialize a session for a date whose fixed slot
 * now falls outside an active center-hours override's windows — the iftar-gap case
 * `session.generate` reports in `skippedOutsideHours` (SOU-165). The session was
 * deliberately skipped, not lost: the admin must re-time the slot. Carries the
 * skipped `date` so the caller can name it.
 */
export class SessionOutsideOverrideHoursError extends Error {
  constructor(readonly date: string) {
    super(`session on ${date} was skipped: outside the active center-hours override windows`);
    this.name = 'SessionOutsideOverrideHoursError';
  }
}

export function isSessionOutsideOverrideHoursError(
  error: unknown,
): error is SessionOutsideOverrideHoursError {
  return error instanceof SessionOutsideOverrideHoursError;
}

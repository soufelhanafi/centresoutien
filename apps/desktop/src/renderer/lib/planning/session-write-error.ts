/**
 * The scheduling errors the weekly-session write channels raise, as the renderer
 * must handle them (SOU-131 backend contract). The domain throws these; their
 * **structured fields do not survive the Electron IPC boundary**, so the renderer
 * matches on the error's class name (carried in the serialized message) and
 * localizes a fixed line via `t(\`errors.${code}\`)` — never by reading a `reason`
 * or clash list off the error.
 *
 * Note there is no holiday case: a holiday clash needs a concrete calendar date,
 * which a recurrence *template* has not — `SessionOnHolidayError` is a dated-session
 * concern, not a template one.
 */
export type SessionWriteErrorCode =
  | 'malformed-session-time'
  | 'session-outside-center-hours'
  | 'room-conflict'
  | 'teacher-conflict'
  | 'invalid-session-validity-range'
  | 'weekly-recurring-session-not-found';

/**
 * Maps a domain error class name → the renderer code. `start < end`, center-hours,
 * room, and teacher clashes are **thrown** by the use case (not Zod schema errors),
 * so they only surface after submit. Order is irrelevant — one write raises one.
 */
const ERROR_NAME_TO_CODE: Readonly<Record<string, SessionWriteErrorCode>> = {
  MalformedSessionTimeError: 'malformed-session-time',
  SessionOutsideCenterHoursError: 'session-outside-center-hours',
  RoomConflictError: 'room-conflict',
  TeacherConflictError: 'teacher-conflict',
  InvalidSessionValidityRangeError: 'invalid-session-validity-range',
  WeeklyRecurringSessionNotFoundError: 'weekly-recurring-session-not-found',
};

/**
 * Narrows a caught weekly-session write rejection to a {@link SessionWriteErrorCode}
 * so the form can surface it inline, or `null` for an unrelated failure the caller
 * should toast generically. Scans the serialized message (Electron prefixes the
 * original error's class name into it) for a known domain error name — the only
 * part of the thrown error that reliably crosses the boundary.
 */
export function mapSessionWriteError(error: unknown): SessionWriteErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  return null;
}

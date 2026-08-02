import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The scheduling errors the weekly-session write channels raise, as the renderer
 * must handle them (SOU-131 backend contract). The domain throws these; the
 * renderer decodes the stable code from the IPC rejection (see
 * `resolveDomainErrorCode`) and localizes a fixed line via `t(\`errors.${code}\`)`
 * — never by reading a `reason` or clash list off the error.
 *
 * `SessionOutsideCenterHoursError`, `RoomConflictError`, and `TeacherConflictError`
 * carry no explicit domain `.code` (unlike their siblings below), so the
 * dispatcher falls back to the class name as the decoded code — hence this map's
 * keys are a mix of kebab-case domain codes and PascalCase class names.
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
 * Maps a decoded domain error code → the renderer code. `start < end`, center-hours,
 * room, and teacher clashes are **thrown** by the use case (not Zod schema errors),
 * so they only surface after submit. Order is irrelevant — one write raises one.
 */
const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, SessionWriteErrorCode>> = {
  'malformed-session-time': 'malformed-session-time',
  SessionOutsideCenterHoursError: 'session-outside-center-hours',
  RoomConflictError: 'room-conflict',
  TeacherConflictError: 'teacher-conflict',
  'invalid-session-validity-range': 'invalid-session-validity-range',
  'weekly-recurring-session-not-found': 'weekly-recurring-session-not-found',
};

/**
 * Narrows a caught weekly-session write rejection to a {@link SessionWriteErrorCode}
 * so the form can surface it inline, or `null` for an unrelated failure the caller
 * should toast generically.
 */
export function mapSessionWriteError(error: unknown): SessionWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null ? (DECODED_CODE_TO_RENDERER_CODE[code] ?? null) : null;
}

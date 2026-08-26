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
  | 'outside-windows'
  | 'room-conflict'
  | 'teacher-conflict'
  | 'invalid-session-validity-range'
  | 'weekly-recurring-session-not-found'
  | 'group-over-capacity';

/**
 * Maps a decoded domain error code → the renderer code. `start < end`, center-hours,
 * room, and teacher clashes are **thrown** by the use case (not Zod schema errors),
 * so they only surface after submit. `group-over-capacity` (SOU-176) fires when a
 * session binds a group to a room too small for it. Order is irrelevant — one write
 * raises one.
 */
const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, SessionWriteErrorCode>> = {
  'malformed-session-time': 'malformed-session-time',
  SessionOutsideCenterHoursError: 'session-outside-center-hours',
  'outside-windows': 'outside-windows',
  RoomConflictError: 'room-conflict',
  TeacherConflictError: 'teacher-conflict',
  'invalid-session-validity-range': 'invalid-session-validity-range',
  'weekly-recurring-session-not-found': 'weekly-recurring-session-not-found',
  'group-over-capacity': 'group-over-capacity',
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

/**
 * Why a teacher-availability warning fired (SOU-283), mirroring the domain
 * `TeacherUnavailableReason`: `out-of-window` — the slot fits none of the
 * teacher's weekly windows for that weekday (an empty day counts); `exception` —
 * a one-off absence covers the slot. `null` when the reason did not survive the
 * transport (the bare `teacher-unavailable` code), so the alert falls back to a
 * reason-agnostic line.
 */
export type TeacherAvailabilityConflictReason = 'out-of-window' | 'exception';

/**
 * One classified weekly-session write rejection (SOU-283): a hard blocking
 * `error` (room/teacher double-book, outside hours, malformed time …) or a
 * forceable `warning` — the teacher is placed outside their declared
 * availability, or a student enrolled in the slot's group also attends another
 * group whose session overlaps. A warning mirrors the SOU-189 double-book force
 * UX — the admin acknowledges it to push the write through with
 * `allowScheduleConflict`.
 */
export type SessionWriteConflict =
  | { readonly severity: 'error'; readonly code: SessionWriteErrorCode }
  | {
      readonly severity: 'warning';
      readonly kind: 'teacher-availability';
      readonly reason: TeacherAvailabilityConflictReason | null;
    }
  | { readonly severity: 'warning'; readonly kind: 'student' };

/**
 * The stable domain codes a teacher-availability rejection may carry. The base
 * `teacher-unavailable` code (SOU-259) crosses IPC without its structured
 * `reason` (only `code`/`message` survive the hop), so it maps to a `null` reason;
 * the reason-qualified codes are accepted too in case the domain later encodes the
 * reason into the code, so the alert can name when the teacher actually works.
 */
const TEACHER_AVAILABILITY_CODE_TO_REASON: Readonly<
  Record<string, TeacherAvailabilityConflictReason | null>
> = {
  'teacher-unavailable': null,
  'teacher-unavailable-out-of-window': 'out-of-window',
  'teacher-unavailable-exception': 'exception',
};

/**
 * Classifies a caught weekly-session write rejection (SOU-283): a forceable
 * teacher-availability or student `warning`, a hard `error` the form surfaces
 * inline, or `null` for an unrelated failure the caller toasts generically. One
 * write raises one conflict.
 */
export function classifySessionWriteError(error: unknown): SessionWriteConflict | null {
  const code = resolveDomainErrorCode(error);
  if (code === null) return null;
  const availabilityReason = TEACHER_AVAILABILITY_CODE_TO_REASON[code];
  if (availabilityReason !== undefined) {
    return { severity: 'warning', kind: 'teacher-availability', reason: availabilityReason };
  }
  if (code === 'student-double-booked') {
    return { severity: 'warning', kind: 'student' };
  }
  const rendererCode = DECODED_CODE_TO_RENDERER_CODE[code];
  return rendererCode ? { severity: 'error', code: rendererCode } : null;
}

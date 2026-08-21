/** A bilingual `{ fr, ar }` label, the shape `localizedText` consumes. */
export type BilingualText = { readonly fr: string; readonly ar: string };

/**
 * Why a persisted session no longer sits inside a valid window. Mirrors the
 * domain `SessionAuditReason` taxonomy, which SOU-296 extends to the full
 * conflict set — one canonical code per row, in precedence order (a same-row
 * clash surfaces its single most-blocking reason, never a list):
 * - `outside-center-hours` — the center's effective (override-aware) hours were
 *   narrowed so the session's fixed time now falls outside every open window.
 * - `holiday/blackout` — a holiday or center blackout added after scheduling now
 *   covers the occurrence's civil date.
 * - `teacher-unavailable` — the teacher's declared availability changed after
 *   scheduling so the slot no longer fits (soft, forceable).
 * - `teacher-double-booked` — the teacher is now booked on another overlapping
 *   live session at this slot.
 * - `room-double-booked` — the room is now booked by another overlapping live
 *   session at this slot.
 * - `room-archived` — the session's room was archived after scheduling.
 * - `room-over-capacity` — the room's capacity is below the group's current live
 *   active enrollment (soft warning, forceable).
 */
export type SessionAuditReason =
  | 'outside-center-hours'
  | 'holiday/blackout'
  | 'teacher-unavailable'
  | 'teacher-double-booked'
  | 'room-double-booked'
  | 'room-archived'
  | 'room-over-capacity';

/**
 * The codes the IPC boundary still emits today: the domain use case and the
 * `session.audit.outside-hours` schema ship the SOU-296 taxonomy, so until the
 * backend publishes the canonical set the wire still speaks the legacy vocabulary.
 * {@link canonicalizeReason} translates it at the gateway so the UI renders one
 * vocabulary only — drop both this type and the map once the backend lands.
 */
export type LegacySessionAuditReason =
  | 'outside-center-hours'
  | 'on-holiday'
  | 'outside-teacher-availability';

/** The legacy→canonical SOU-296 mapping: `on-holiday`→`holiday/blackout`,
 *  `outside-teacher-availability`→`teacher-unavailable`, the rest already share a name. */
export function canonicalizeReason(
  reason: LegacySessionAuditReason | SessionAuditReason,
): SessionAuditReason {
  switch (reason) {
    case 'on-holiday':
      return 'holiday/blackout';
    case 'outside-teacher-availability':
      return 'teacher-unavailable';
    default:
      return reason;
  }
}

/**
 * Presentation projection of one concrete dated session occurrence — the mirror
 * of the domain boundary's `SessionOccurrenceView` (`SessionOccurrenceDto` in
 * `shared/ipc/contract.ts`). Every join-derived display field degrades to `null`
 * (archived / not-yet-synced) rather than dropping the row; `kind` always has a
 * value. `id` is the occurrence id (`ses_…`) the per-occurrence cancel consumes —
 * never `recurringSessionId` (the weekly template).
 */
export type SessionOccurrenceView = {
  readonly id: string;
  readonly recurringSessionId: string;
  /** Civil `YYYY-MM-DD` date of the occurrence. */
  readonly date: string;
  /** `'HH:mm'` wall-clock start/end, not timestamps. */
  readonly start: string;
  readonly end: string;
  readonly roomId: string;
  readonly roomName: string | null;
  readonly teacherId: string | null;
  readonly teacherName: BilingualText | null;
  readonly groupId: string | null;
  readonly subjectId: string | null;
  readonly subjectName: BilingualText | null;
  readonly level: string | null;
  readonly kind: 'regular' | 'exam-prep';
};

/**
 * One stranded session the audit report lists — the mirror of the domain
 * `StrandedSession` (`StrandedSessionDto`): the dated occurrence plus the single
 * canonical reason it now falls outside a valid window.
 */
export type StrandedSessionView = {
  readonly session: SessionOccurrenceView;
  readonly reason: SessionAuditReason;
};

/** A bilingual `{ fr, ar }` label, the shape `localizedText` consumes. */
export type BilingualText = { readonly fr: string; readonly ar: string };

/**
 * Why a persisted session no longer sits inside a valid window (SOU-201).
 * Mirrors the domain `SessionAuditReason`:
 * - `outside-center-hours` — the center's effective (override-aware) hours were
 *   narrowed so the session's fixed time now falls outside every open window.
 * - `on-holiday` — a holiday added after the session was scheduled now covers
 *   its civil date.
 *
 * Exactly one reason per row; `on-holiday` wins when both apply.
 */
export type SessionAuditReason = 'outside-center-hours' | 'on-holiday';

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
 * reason it now falls outside a valid window.
 */
export type StrandedSessionView = {
  readonly session: SessionOccurrenceView;
  readonly reason: SessionAuditReason;
};

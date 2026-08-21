/** A bilingual `{ fr, ar }` label, the shape `localizedText` consumes. */
export type BilingualText = { readonly fr: string; readonly ar: string };

/**
 * The seven canonical audit reason codes (SOU-296) — the renderer mirror of the
 * domain `SessionAuditReason`, verbatim (no local renaming). One occurrence may
 * be stranded for several reasons at once; the domain groups per reason.
 */
export type SessionAuditReason =
  | 'outside-center-hours'
  | 'on-holiday'
  | 'outside-teacher-availability'
  | 'teacher-double-booked'
  | 'room-double-booked'
  | 'room-archived'
  | 'room-over-capacity';

/**
 * Presentation projection of one concrete dated session occurrence — the mirror
 * of the domain boundary's `SessionOccurrenceDto` (`shared/ipc/contract.ts`).
 * Every join-derived display field degrades to `null` (archived / not-yet-synced)
 * rather than dropping the row; `kind` always has a value. `id` is the occurrence
 * id (`ses_…`) the per-occurrence cancel consumes — never `recurringSessionId`
 * (the weekly template).
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
  /** Seats the room holds, or `null` when the capacity is unknown. */
  readonly roomCapacity: number | null;
  /** Whether the room was archived after scheduling. */
  readonly roomArchived: boolean;
  readonly teacherId: string | null;
  readonly teacherName: BilingualText | null;
  readonly groupId: string | null;
  readonly subjectId: string | null;
  readonly subjectName: BilingualText | null;
  readonly level: string | null;
  readonly kind: 'regular' | 'exam-prep';
};

/**
 * One stranded occurrence the audit report lists — the dated occurrence plus
 * EVERY canonical reason it now falls outside a valid window (a double-booked
 * room that is also over capacity carries both).
 */
export type StrandedSessionView = {
  readonly session: SessionOccurrenceView;
  readonly reasons: readonly SessionAuditReason[];
};

/**
 * Which resource a finding is anchored to — the renderer mirror of the domain
 * `StrandedResourceKind`. Drives the collapsed card's identity label.
 */
export type StrandedResourceKind = 'room' | 'teacher' | 'center';

/**
 * One domain-grouped structural audit problem (SOU-296): every stranded
 * occurrence sharing one reason, weekday, and primary resource, already
 * collapsed by the domain — the renderer never re-groups. `count` is the number
 * of occurrences actually stranded, `key` the domain's stable group key, and
 * `weekday` / `resourceKind` / `resourceId` identify the root cause (a teacher,
 * a room, or the center) so the card renders that identity rather than the first
 * occurrence's subject.
 */
export type StrandedGroupView = {
  readonly key: string;
  readonly reason: SessionAuditReason;
  readonly weekday: number;
  readonly resourceKind: StrandedResourceKind;
  readonly resourceId: string | null;
  readonly count: number;
  readonly occurrences: readonly StrandedSessionView[];
};

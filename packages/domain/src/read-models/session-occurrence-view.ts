import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { RoomId } from '../entities/room';
import type { SubjectId } from '../entities/subject';
import type { GroupId, GroupKind } from '../entities/group';
import type { SessionId } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';

/**
 * Denormalized read model for a concrete, dated {@link Session} occurrence
 * (SOU-201) — the dated sibling of {@link WeeklySessionView}. One materialized
 * session joined with the names the out-of-effective-hours audit report needs to
 * be usable: the room name, the (optional) teacher name, and the group's subject
 * (id + bilingual label), `level`, and `kind`, so the renderer shows "Maths — 2e
 * Bac, salle 3, jeudi 09:00" rather than raw ids.
 *
 * Cross-aggregate read model, not an entity: no sync envelope, never persisted or
 * written back. Produced by {@link SessionOccurrenceViewReadPort}; the SQLite
 * adapter builds it with LEFT JOINs so an occurrence whose group/room/teacher is
 * missing or archived (soft-deleted) still appears, degraded to a neutral shape
 * rather than dropped — identical fallback rules to {@link WeeklySessionView}:
 *
 * - `groupId` / `subjectId` / `subjectName` / `level` are `null` when the session
 *   has no group or the group is archived; `subjectName` is additionally `null`
 *   when the group's subject is archived (the id is still known).
 * - `roomName` is `null` if the room is archived/not-yet-synced; `teacherName` is
 *   `null` when the teacher is unassigned, archived, or not-yet-synced.
 * - `kind` falls back to `'regular'` when there is no live group.
 * - `roomCapacity` is `null` when the room is archived or not-yet-synced (its
 *   capacity is only meaningful for a live room); `roomArchived` is the room's
 *   tombstone state, so the audit can distinguish "archived" from "not synced".
 *
 * It also carries the raw placement — `date`, `start`, `end` — so the audit can
 * run its pure hours/holiday checks on the same object it returns, without a
 * second read of the underlying entity. `recurringSessionId` lets the report link
 * back to the template the occurrence came from. The two room columns (SOU-296)
 * back the room-archived and room-over-capacity findings without a second room
 * read; the group's live enrollment count is resolved separately (batch read,
 * see `AuditSessionsOutsideEffectiveHours`), not carried here.
 */
export type SessionOccurrenceView = {
  readonly id: SessionId;
  readonly recurringSessionId: WeeklyRecurringSessionId;
  readonly date: string; // materialized occurrence, strict 'YYYY-MM-DD'
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
  readonly roomId: RoomId;
  readonly roomName: string | null;
  readonly roomCapacity: number | null;
  readonly roomArchived: boolean;
  readonly teacherId: EntityId | null;
  readonly teacherName: { fr: string; ar: string } | null;
  readonly groupId: GroupId | null;
  readonly subjectId: SubjectId | null;
  readonly subjectName: { fr: string; ar: string } | null;
  readonly level: string | null;
  readonly kind: GroupKind;
};

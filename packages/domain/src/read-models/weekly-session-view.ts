import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from '../entities/room';
import type { SubjectId } from '../entities/subject';
import type { GroupId, GroupKind } from '../entities/group';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';

/**
 * Denormalized read model for the planner grid (SOU-54): one
 * {@link WeeklyRecurringSession} joined with the names/attributes the grid needs to
 * render a block — the room name, the (optional) teacher name, and the group's
 * subject (id + bilingual label), `level`, and `kind`. It exists so the grid can
 * colour a block by subject, badge exam-prep, and filter by teacher / room / level
 * without a second round of reads.
 *
 * This is a **cross-aggregate read model**, not an entity: it carries no sync
 * envelope and is never persisted or written back. It is produced by
 * {@link WeeklySessionViewReadPort}; the SQLite adapter builds it with LEFT JOINs so
 * a session with **no live group** still appears — degraded to a neutral shape
 * rather than dropped:
 *
 * - `groupId` / `subjectId` / `subjectName` / `level` are `null` when the session
 *   has no group or the group is archived (soft-deleted).
 * - `subjectName` is additionally `null` when the group's subject is archived, even
 *   though `subjectId` is still known — the grid can still colour by the id.
 * - `roomName` is `null` if the room is archived/not-yet-synced; `teacherName` is
 *   `null` when the teacher is unassigned, archived, or not-yet-synced.
 * - `kind` falls back to `'regular'` when there is no live group, so the badge/filter
 *   always has a defined value.
 *
 * Bilingual labels (`subjectName`, `teacherName`) carry both scripts so the renderer
 * picks the side by active locale — the AR-RTL planner renders native Arabic names.
 * Timing fields keep the domain's branded types (`WeekdayIndex`, `TimeOfDay`) so a
 * raw string can't stand in across the boundary.
 */
export type WeeklySessionView = {
  readonly id: WeeklyRecurringSessionId;
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
  readonly roomId: RoomId;
  readonly roomName: string | null;
  readonly teacherId: EntityId | null;
  readonly teacherName: { fr: string; ar: string } | null;
  readonly groupId: GroupId | null;
  readonly subjectId: SubjectId | null;
  readonly subjectName: { fr: string; ar: string } | null;
  readonly level: string | null;
  readonly kind: GroupKind;
};

import type { WeekdayIndex } from '@centresoutien/domain';

/** Regular vs exam-prep track — mirrors the domain `Session.kind` (CLAUDE.md §7). */
export type SessionKind = 'regular' | 'exam-prep';

/**
 * Presentation projection of one weekly recurring session as the planner grid
 * reads it. This is the **read model** the grid consumes: the storage entity
 * `WeeklyRecurringSession` (SOU-53: `roomId`, `teacherId`, `dayOfWeek`, `start`,
 * `end` + envelope) joined with the room name, the (optional) teacher name, and
 * the group's subject + level + kind — the fields the grid needs to colour a
 * block by subject, badge exam-prep, and filter by teacher / room / level.
 *
 * Timing fields keep the domain's own types (`WeekdayIndex`, `'HH:mm'` times) so
 * a raw string can't stand in for a validated one across the boundary. It is the
 * planner's counterpart to `RoomView` — a UI-facing DTO, never a copy of the
 * entity.
 *
 * ## Contract status (SOU-54 frontend ↔ SOU-53 data)
 * SOU-53 published the entity + `listForWeek(centerCode)` port but **no IPC
 * channel yet** (flagged as a small follow-up that "won't change shapes"). The
 * grid therefore ships against {@link mockPlannerGateway}; the real read model —
 * a `session.listWeek` channel whose handler performs the room/teacher/subject
 * join above — drops in behind {@link PlannerGateway} with no component change.
 */
export type PlannerSessionView = {
  readonly id: string;
  readonly dayOfWeek: WeekdayIndex;
  /** Wall-clock start `'HH:mm'`, local to the center. */
  readonly start: string;
  /** Wall-clock end `'HH:mm'`, strictly after `start`. */
  readonly end: string;
  readonly roomId: string;
  readonly roomName: string;
  /** `null` when the session has no teacher assigned yet. */
  readonly teacherId: string | null;
  readonly teacherName: string | null;
  readonly subjectId: string;
  /** Bilingual subject label — the grid picks the side by active locale. */
  readonly subjectName: { readonly fr: string; readonly ar: string };
  readonly level: string;
  readonly kind: SessionKind;
};

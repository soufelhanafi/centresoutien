import type { WeeklySessionDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of one weekly recurring session as the planner grid
 * reads it — the **enriched** read model (SOU-118): the storage entity
 * `WeeklyRecurringSession` joined with the room name, the (optional, bilingual)
 * teacher name, and the session's group subject (id + bilingual label), `level`,
 * and `kind`. Those are the fields the grid needs to colour a block by subject,
 * badge exam-prep, and filter by teacher / room / level.
 *
 * This is a direct alias of the boundary's `weeklySessionViewSchema` (the single
 * source of truth in `shared/ipc/contract`, aligned field-for-field with the
 * domain `WeeklySessionView`), so the renderer shape can never drift from what the
 * `session.week` channel actually returns — exactly like `TeacherView`/`RoomView`.
 *
 * The join-derived fields degrade to their neutral fallback rather than dropping
 * the row, so every field except `id`/timing/`roomId`/`kind` may be `null`:
 * - `roomName` / `teacherName` are `null` for an unassigned, archived, or
 *   not-yet-synced room/teacher. `teacherName` is bilingual so AR-RTL renders the
 *   native Arabic name.
 * - `groupId` / `subjectId` / `subjectName` / `level` are `null` when the session
 *   has no live group (or it is archived). `subjectName` is additionally `null`
 *   when the subject itself is archived, though `subjectId` stays set so the grid
 *   can still colour by id.
 * - `kind` always has a value (`'regular'` fallback), so the badge/filter is safe.
 */
export type PlannerSessionView = WeeklySessionDto;

/** Regular vs exam-prep track — mirrors the domain `Session.kind` (CLAUDE.md §7). */
export type SessionKind = WeeklySessionDto['kind'];

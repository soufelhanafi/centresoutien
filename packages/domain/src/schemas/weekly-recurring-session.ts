import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { TIME_OF_DAY_REGEX } from '../value-objects/time-of-day';
import { ROOM_ID_PREFIX } from '../entities/room';
import { GROUP_ID_PREFIX } from '../entities/group';
import { TEACHER_ID_PREFIX } from '../entities/teacher';
import { WEEKLY_RECURRING_SESSION_ID_PREFIX } from '../entities/weekly-recurring-session';
import { isCalendarDate } from './student';

/**
 * Weekly recurring session input schema (SOU-131) — the user-editable fields when
 * creating or editing a planner slot. The envelope (ULID, centerCode, timestamps,
 * version…) is set by the use case, never by the form.
 *
 * Resolved defaults (kickoff): `groupId` and `teacherId` are **optional** (absent
 * or `null` = unassigned); the form-side validity window is defaults-only, so both
 * `validFrom`/`validTo` default to `null` (unbounded) and `active` defaults to
 * `true` when omitted — but each is still accepted when the caller sends it.
 *
 * Shape only: prefixes for the id references, `HH:mm` for the times, `YYYY-MM-DD`
 * for the validity bounds, `0..6` for the weekday. The **ordering** invariants
 * (`start < end`, `validFrom <= validTo`) are the factory's / conflict policy's job
 * (see {@link createWeeklyRecurringSession}), not the schema's — a malformed slot
 * surfaces as {@link MalformedSessionTimeError} /
 * {@link InvalidSessionValidityRangeError}, not a Zod field error, so the domain is
 * the single authority on scheduling invariants.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each via `t(\`errors.${code}\`)`. This
 * same schema validates the form (zodResolver), the IPC boundary, and the use case.
 */

const roomRef = z
  .string()
  .refine((value) => hasIdPrefix(value, ROOM_ID_PREFIX), { message: 'invalid-id' });

/** Optional teacher: absent or `null` = unassigned; a present value must be a `tch_` id. */
const teacherRef = z
  .string()
  .refine((value) => hasIdPrefix(value, TEACHER_ID_PREFIX), { message: 'invalid-id' })
  .nullable()
  .default(null);

/** Optional group: absent or `null` = a slot not yet attached to a group; else a `grp_` id. */
const groupRef = z
  .string()
  .refine((value) => hasIdPrefix(value, GROUP_ID_PREFIX), { message: 'invalid-id' })
  .nullable()
  .default(null);

const timeString = z.string().regex(TIME_OF_DAY_REGEX, { message: 'invalid-time' });

/** Optional validity bound: absent or `null` = unbounded; else a strict `YYYY-MM-DD`. */
const validityBound = z
  .string()
  .refine(isCalendarDate, { message: 'invalid-date' })
  .nullable()
  .default(null);

const weekday = z
  .number()
  .int({ message: 'invalid-weekday' })
  .min(0, { message: 'invalid-weekday' })
  .max(6, { message: 'invalid-weekday' });

export const weeklyRecurringSessionInputSchema = z.object({
  roomId: roomRef,
  teacherId: teacherRef,
  groupId: groupRef,
  dayOfWeek: weekday,
  start: timeString,
  end: timeString,
  active: z.boolean().default(true),
  validFrom: validityBound,
  validTo: validityBound,
});

export type WeeklyRecurringSessionInput = z.infer<typeof weeklyRecurringSessionInputSchema>;

const recurringSessionRef = z
  .string()
  .refine((value) => hasIdPrefix(value, WEEKLY_RECURRING_SESSION_ID_PREFIX), {
    message: 'invalid-id',
  });

/** The edit variant: the same editable fields plus the target `wrs_` id. */
export const weeklyRecurringSessionUpdateSchema = weeklyRecurringSessionInputSchema.extend({
  id: recurringSessionRef,
});

export type WeeklyRecurringSessionUpdateInput = z.infer<typeof weeklyRecurringSessionUpdateSchema>;

import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { SUBJECT_ID_PREFIX } from '../entities/subject';
import { ROOM_ID_PREFIX } from '../entities/room';
import { GROUP_KINDS } from '../entities/group';

/**
 * Group input schema — the user-editable fields when creating a Group. The
 * envelope (ULID, centerCode, timestamps, version…) and `active` are set by the
 * use case, never by the form.
 *
 * `capacity ≥ 1` and a valid `kind` are the entity invariants and live here so
 * the single schema enforces them for both the form (via zodResolver) and the use
 * case. The cross-entity `capacity ≤ room.capacity` check needs the room, so it
 * stays in the use case — not here (a schema is pure and entity-local).
 *
 * `teacherId` is nullable and validated only as a non-empty string: the Teacher
 * entity (SOU-36) is not built, so there is no `tch_` prefix to check yet —
 * tighten this to `hasIdPrefix` when it lands. `subjectId`/`roomId` are checked
 * for their prefix; that they resolve to a live, active row is a use-case concern.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

export const GROUP_LEVEL_MAX = 40;
export const GROUP_CAPACITY_MIN = 1;

const subjectRef = z
  .string()
  .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' });

const roomRef = z
  .string()
  .refine((value) => hasIdPrefix(value, ROOM_ID_PREFIX), { message: 'invalid-id' });

/** Optional teacher: absent or `null` means "unassigned"; a present value must be non-empty. */
const teacherRef = z
  .string()
  .min(1, { message: 'invalid-id' })
  .nullable()
  .default(null);

export const groupInputSchema = z.object({
  subjectId: subjectRef,
  teacherId: teacherRef,
  roomId: roomRef,
  level: z
    .string()
    .trim()
    .min(1, { message: 'required' })
    .max(GROUP_LEVEL_MAX, { message: 'too-long' }),
  // An empty numeric field arrives as NaN; the base-type `error` maps that — and
  // any non-number — to the same `not-an-integer` code the form localizes.
  capacity: z
    .number({ error: 'not-an-integer' })
    .int({ message: 'not-an-integer' })
    .min(GROUP_CAPACITY_MIN, { message: 'capacity-too-small' }),
  kind: z.enum(GROUP_KINDS, { error: 'invalid-kind' }),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { SUBJECT_ID_PREFIX } from '../entities/subject';
import { NIVEAU_ID_PREFIX } from '../entities/niveau';
import { GROUP_KINDS } from '../entities/group';

/**
 * Group input schema — the user-editable fields when creating a Group. The
 * envelope (ULID, centerCode, timestamps, version…) and `active` are set by the
 * use case, never by the form.
 *
 * `capacity ≥ 1` and a valid `kind` are the entity invariants and live here so
 * the single schema enforces them for both the form (via zodResolver) and the use
 * case.
 *
 * `teacherId` is nullable and validated only as a non-empty string: the Teacher
 * entity (SOU-36) is not built, so there is no `tch_` prefix to check yet —
 * tighten this to `hasIdPrefix` when it lands. `subjectId` is checked for its
 * prefix; that it resolves to a live, active row is a use-case concern. Rooms are
 * not part of a group — they attach at session creation (SOU-176).
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

export const GROUP_LEVEL_MAX = 40;
export const GROUP_CAPACITY_MIN = 1;

const subjectRef = z
  .string()
  .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' });

/** Optional teacher: absent or `null` means "unassigned"; a present value must be non-empty. */
const teacherRef = z
  .string()
  .min(1, { message: 'invalid-id' })
  .nullable()
  .default(null);

/**
 * Optional Niveau reference (SOU-260): absent, `null`, or blank collapses to
 * `null` ("not classified yet"); a present value must carry the `niv_` prefix —
 * a shape check only. Exactly one niveau per group when set. Optional (not
 * defaulted) so pre-SOU-260 callers that omit it keep compiling — the use case
 * stores `null`.
 */
const niveauRef = z
  .string()
  .nullable()
  .refine((value) => value === null || hasIdPrefix(value, NIVEAU_ID_PREFIX), {
    message: 'invalid-id',
  })
  .optional();

export const groupInputSchema = z.object({
  subjectId: subjectRef,
  teacherId: teacherRef,
  niveauId: niveauRef,
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

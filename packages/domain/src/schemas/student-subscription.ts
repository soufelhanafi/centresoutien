import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { STUDENT_ID_PREFIX } from '../entities/student';
import { SUBJECT_ID_PREFIX } from '../entities/subject';
import { FORMULA_ID_PREFIX } from '../entities/student-subscription';
import { GROUP_KINDS } from '../entities/group';
import { MONTH_PATTERN } from './enrollment';

/**
 * StudentSubscription input schema — the fields captured when a student subscribes
 * to a Formula. The envelope (ULID, centerCode, timestamps, version…) is set by the
 * use case, never by the form.
 *
 * `studentId` / `formulaId` / `subjectIds` are checked for their id prefix only;
 * that they resolve to live, same-center rows is a use-case concern (a schema is
 * pure and entity-local). `kind` + `subjectIds` are the **frozen snapshot** of the
 * referenced formula, supplied by the caller — the subscription trusts them and
 * never re-derives from the (non-existent) Formula entity. `subjectIds` must be
 * non-empty (a priced bundle covers at least one subject). `startMonth` is required
 * and `endMonth` optional (`null` = open-ended / still active); both are `YYYY-MM`,
 * and `endMonth` may not precede `startMonth`.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

const studentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, STUDENT_ID_PREFIX), { message: 'invalid-id' });

const formulaRef = z
  .string()
  .refine((value) => hasIdPrefix(value, FORMULA_ID_PREFIX), { message: 'invalid-id' });

const subjectRef = z
  .string()
  .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' });

const month = z.string().regex(MONTH_PATTERN, { message: 'invalid-month' });

export const studentSubscriptionInputSchema = z
  .object({
    studentId: studentRef,
    formulaId: formulaRef,
    kind: z.enum(GROUP_KINDS, { error: 'invalid-kind' }),
    subjectIds: z.array(subjectRef).min(1, { message: 'subjects-required' }),
    startMonth: month,
    // Absent or `null` means "open-ended" (still active); a present value must be a valid month.
    endMonth: month.nullable().default(null),
  })
  .refine((v) => v.endMonth === null || v.endMonth >= v.startMonth, {
    message: 'end-before-start',
    path: ['endMonth'],
  });

export type StudentSubscriptionInput = z.infer<typeof studentSubscriptionInputSchema>;

/**
 * Close input — the month a live subscription is capped at. `CloseStudentSubscription`
 * validates the format here; that `endMonth >= startMonth` is a cross-entity check in
 * the use case (the schema does not know the stored start).
 */
export const closeStudentSubscriptionMonthSchema = month;

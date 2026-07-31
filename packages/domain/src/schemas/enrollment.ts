import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { STUDENT_ID_PREFIX } from '../entities/student';
import { GROUP_ID_PREFIX } from '../entities/group';

/**
 * Enrollment input schema — the user-editable fields when enrolling a student in a
 * group. The envelope (ULID, centerCode, timestamps, version…) is set by the use
 * case, never by the form.
 *
 * `studentId` / `groupId` are checked for their prefix only; that they resolve to a
 * live, same-center row is a use-case concern (a schema is pure and entity-local).
 * `startMonth` is required and `endMonth` optional (`null` = open-ended); both are
 * `YYYY-MM`, and `endMonth` may not precede `startMonth`.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

/** Inclusive calendar month, `YYYY-MM` with a real 01–12 month. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const studentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, STUDENT_ID_PREFIX), { message: 'invalid-id' });

const groupRef = z
  .string()
  .refine((value) => hasIdPrefix(value, GROUP_ID_PREFIX), { message: 'invalid-id' });

const month = z.string().regex(MONTH_PATTERN, { message: 'invalid-month' });

export const enrollmentInputSchema = z
  .object({
    studentId: studentRef,
    groupId: groupRef,
    startMonth: month,
    // Absent or `null` means "open-ended"; a present value must be a valid month.
    endMonth: month.nullable().default(null),
  })
  .refine((v) => v.endMonth === null || v.endMonth >= v.startMonth, {
    message: 'end-before-start',
    path: ['endMonth'],
  });

export type EnrollmentInput = z.infer<typeof enrollmentInputSchema>;

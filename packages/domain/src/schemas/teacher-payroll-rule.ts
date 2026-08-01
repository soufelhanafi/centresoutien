import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { TEACHER_ID_PREFIX } from '../entities/teacher';
import { MONTH_PATTERN } from './enrollment';

/**
 * TeacherPayrollRule input schema — the fields captured when a payroll rule is
 * created. The envelope (ULID, centerCode, timestamps, version…) is set by the
 * use case, never by the form.
 *
 * `teacherId` is checked for its id prefix only; that it resolves to a live,
 * same-center row is a use-case concern (a schema is pure and entity-local). A
 * `z.discriminatedUnion` on `kind` mirrors the entity's own tagged union — no
 * third kind is a valid input any more than it is a valid entity, and each
 * branch requires exactly its own amount field (`amountMad` xor `percent`).
 * `startMonth` is required and `endMonth` optional (`null` = open-ended / still
 * active); both are `YYYY-MM`, and `endMonth` may not precede `startMonth`.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain
 * stays i18n-agnostic and the renderer resolves each code via
 * `t(\`errors.${code}\`)`.
 */

const teacherRef = z
  .string()
  .refine((value) => hasIdPrefix(value, TEACHER_ID_PREFIX), { message: 'invalid-id' });

const month = z.string().regex(MONTH_PATTERN, { message: 'invalid-month' });

const fixedMonthlyInputSchema = z.object({
  kind: z.literal('fixed-monthly'),
  teacherId: teacherRef,
  // Integer MAD centimes, matching the `Payment.amountMad` money convention.
  amountMad: z
    .number({ error: 'invalid-amount' })
    .int({ message: 'invalid-amount' })
    .positive({ message: 'invalid-amount' }),
  startMonth: month,
  endMonth: month.nullable().default(null),
});

const percentageInputSchema = z.object({
  kind: z.literal('percentage-of-monthly-fees'),
  teacherId: teacherRef,
  // Percentage points, e.g. 30 for 30% — not a 0..1 fraction.
  percent: z
    .number({ error: 'invalid-percent' })
    .positive({ message: 'invalid-percent' })
    .max(100, { message: 'invalid-percent' }),
  startMonth: month,
  endMonth: month.nullable().default(null),
});

export const teacherPayrollRuleInputSchema = z
  .discriminatedUnion('kind', [fixedMonthlyInputSchema, percentageInputSchema])
  .refine((v) => v.endMonth === null || v.endMonth >= v.startMonth, {
    message: 'end-before-start',
    path: ['endMonth'],
  });

export type TeacherPayrollRuleInput = z.infer<typeof teacherPayrollRuleInputSchema>;

/**
 * Close input — the month a live rule is capped at. `CloseTeacherPayrollRule`
 * validates the format here; that `endMonth >= startMonth` is a cross-entity
 * check in the use case (the schema does not know the stored start).
 */
export const closeTeacherPayrollRuleMonthSchema = month;

import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { SUBJECT_ID_PREFIX } from '../entities/subject';
import { GROUP_KINDS } from '../entities/group';

/**
 * Formula input schema — the user-editable fields when creating or editing a
 * Formula: its bilingual name, the subjects it bundles, its single MAD price, and
 * its regular/exam-prep track (KICKOFF, SOU-60 — no per-subject price map, no
 * "level applicability"; see `entities/formula.ts`). The envelope and `isImmutable`
 * are never caller-supplied: the envelope is set by the use case, `isImmutable` is
 * flipped by a SQLite trigger (SOU-61).
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

export const FORMULA_NAME_MAX = 80;

const frName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(FORMULA_NAME_MAX, { message: 'too-long' });

// AR is optional-but-length-capped (SOU-271): FR-only data entry is supported,
// so an empty AR name is valid; an over-length one still fails.
const arName = z
  .string()
  .trim()
  .max(FORMULA_NAME_MAX, { message: 'too-long' });

const subjectRef = z
  .string()
  .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' });

export const formulaInputSchema = z.object({
  name: z.object({ fr: frName, ar: arName }),
  // A priced bundle covers at least one subject.
  subjectIds: z.array(subjectRef).min(1, { message: 'subjects-required' }),
  // Integer MAD centimes, matching InvoiceLine.amountMad; a formula must have a
  // real price (it is, by definition, what a student pays for).
  priceMad: z
    .number({ error: 'invalid-price' })
    .int({ message: 'invalid-price' })
    .positive({ message: 'invalid-price' }),
  kind: z.enum(GROUP_KINDS, { error: 'invalid-kind' }),
});

export type FormulaInput = z.infer<typeof formulaInputSchema>;

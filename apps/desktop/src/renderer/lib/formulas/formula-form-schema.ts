import { z } from 'zod';
import { formulaInputSchema } from '@centresoutien/domain';
import { validateSubjectPrices } from './subject-prices';
import type { FormulaWriteInput } from './formula-view';

/**
 * The formula create/edit form's schema (SOU-298). Extends the shared domain
 * `formulaInputSchema` with two presentation-only fields: `usePerSubjectPricing`
 * (the "split the bundle price per subject" toggle) and the `subjectPrices` map
 * it drives. When the toggle is off the map is ignored (equal-split); when on,
 * a `superRefine` enforces coverage, positive amounts, and sum-equals-total —
 * mirroring the domain's `InvalidFormulaSubjectPricesError` codes so a live
 * client error reads exactly like a server-rejected one.
 */
const subjectPriceRowSchema = z.object({
  subjectId: z.string(),
  priceMad: z.number(),
});

export const formulaFormSchema = formulaInputSchema
  .extend({
    usePerSubjectPricing: z.boolean(),
    subjectPrices: z.array(subjectPriceRowSchema),
  })
  .superRefine((values, ctx) => {
    if (!values.usePerSubjectPricing) return;
    const code = validateSubjectPrices({
      subjectIds: values.subjectIds,
      subjectPrices: values.subjectPrices,
      totalMad: values.priceMad,
    });
    if (code !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: code, path: ['subjectPrices'] });
    }
  });

export type FormulaFormValues = z.infer<typeof formulaFormSchema>;

/**
 * Projects the form values onto the write payload the `formula.create` /
 * `formula.update` channels accept: drops the UI-only toggle, and includes
 * `subjectPrices` only when the director opted into per-subject pricing —
 * otherwise the map is omitted (equal-split), per the SOU-298 contract.
 */
export function toFormulaWriteInput(values: FormulaFormValues): FormulaWriteInput {
  const { usePerSubjectPricing, subjectPrices, ...base } = values;
  return usePerSubjectPricing ? { ...base, subjectPrices } : base;
}

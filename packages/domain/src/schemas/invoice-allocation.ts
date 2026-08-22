import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { SUBJECT_ID_PREFIX } from '../entities/subject';

/**
 * Manual per-invoice attribution allocation input (SOU-298) — the per-subject
 * weight vector a director pins so teacher-fee attribution splits this invoice's
 * collected fees exactly as they choose, overriding the formula's price-map
 * weighting. Structural checks only (a real subject id, a non-negative integer
 * centime amount); the cross-field checks (no duplicate subject, not all-zero)
 * live in `SetInvoiceSubjectAllocation` so they can raise a specific domain error.
 *
 * Setting `allocations: null` clears any existing override back to the weighted
 * default. Messages are stable error codes; the domain stays i18n-agnostic.
 */
const subjectAllocation = z.object({
  subjectId: z
    .string()
    .refine((value) => hasIdPrefix(value, SUBJECT_ID_PREFIX), { message: 'invalid-id' }),
  amountMad: z
    .number({ error: 'invalid-allocation-amount' })
    .int({ message: 'invalid-allocation-amount' })
    .nonnegative({ message: 'invalid-allocation-amount' }),
});

export const invoiceAllocationInputSchema = z.object({
  allocations: z.array(subjectAllocation).min(1, { message: 'allocations-required' }).nullable(),
});

export type InvoiceAllocationInput = z.infer<typeof invoiceAllocationInputSchema>;

import { z } from 'zod';
import { hasIdPrefix } from '../value-objects/ids';
import { STUDENT_ID_PREFIX } from '../entities/student';
import { FORMULA_ID_PREFIX } from '../entities/formula';
import { GROUP_KINDS } from '../entities/group';
import { MONTH_PATTERN } from './enrollment';

/**
 * Invoice input schemas — the shape the domain re-validates before persisting a
 * draft (the domain is the authority even when a form validates first). The envelope
 * (ULID, centerCode, timestamps, version…) and the lifecycle `status` are set by the
 * use case, never by the caller — a draft is always born `draft`.
 *
 * Messages are stable **error codes**, not user-facing strings: the domain stays
 * i18n-agnostic and the renderer resolves each code via `t(\`errors.${code}\`)`.
 */

export const INVOICE_LINE_LABEL_MAX = 120;

const studentRef = z
  .string()
  .refine((value) => hasIdPrefix(value, STUDENT_ID_PREFIX), { message: 'invalid-id' });

const formulaRef = z
  .string()
  .refine((value) => hasIdPrefix(value, FORMULA_ID_PREFIX), { message: 'invalid-id' });

const bilingualLabel = z.object({
  fr: z.string().trim().min(1, { message: 'required' }).max(INVOICE_LINE_LABEL_MAX),
  // AR is optional-but-length-capped (SOU-271): a formula with an empty AR name
  // snapshots an empty AR label and still generates a valid invoice line. The
  // invoice PDF is FR-only, so no AR label is ever surfaced.
  ar: z.string().trim().max(INVOICE_LINE_LABEL_MAX),
});

/** One frozen line snapshot: what was billed, not how it was derived. */
export const invoiceLineSnapshotSchema = z.object({
  formulaId: formulaRef,
  label: bilingualLabel,
  kind: z.enum(GROUP_KINDS, { error: 'invalid-kind' }),
  // Integer MAD centimes, after discount; a fully-discounted line is 0, never negative.
  amountMad: z
    .number({ error: 'invalid-amount' })
    .int({ message: 'invalid-amount' })
    .nonnegative({ message: 'invalid-amount' }),
});
export type InvoiceLineSnapshot = z.infer<typeof invoiceLineSnapshotSchema>;

/**
 * A draft invoice's user-derivable fields. `lines` must be non-empty — an invoice
 * with nothing to bill is never generated (a student with no active subscription
 * that month gets no invoice at all).
 */
export const createInvoiceDraftSchema = z.object({
  studentId: studentRef,
  month: z.string().regex(MONTH_PATTERN, { message: 'invalid-month' }),
  lines: z.array(invoiceLineSnapshotSchema).min(1, { message: 'invoice-no-lines' }),
});
export type CreateInvoiceDraftFields = z.infer<typeof createInvoiceDraftSchema>;

/** The one user-derivable field of the monthly generation job (SOU-68): which month to bill. */
export const generateMonthlyInvoicesSchema = z.object({
  month: z.string().regex(MONTH_PATTERN, { message: 'invalid-month' }),
});
export type GenerateMonthlyInvoicesFields = z.infer<typeof generateMonthlyInvoicesSchema>;

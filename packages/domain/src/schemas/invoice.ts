import { z } from 'zod';
import { hasIdPrefix, isUlid } from '../value-objects/ids';
import { STUDENT_ID_PREFIX } from '../entities/student';
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

/**
 * A formula reference is a `{prefix}_{ULID}` string. It is validated for that generic
 * shape but **not** pinned to the formula prefix — the Formula entity (SOU-60) is not
 * merged, so hard-coding its prefix here would be a guess. Tighten to the real
 * `FORMULA_ID_PREFIX` when SOU-60 lands.
 */
const formulaRef = z.string().refine(
  (value) => {
    const underscore = value.indexOf('_');
    return underscore > 0 && isUlid(value.slice(underscore + 1));
  },
  { message: 'invalid-id' },
);

const bilingualLabel = z.object({
  fr: z.string().trim().min(1, { message: 'required' }).max(INVOICE_LINE_LABEL_MAX),
  ar: z.string().trim().min(1, { message: 'required' }).max(INVOICE_LINE_LABEL_MAX),
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

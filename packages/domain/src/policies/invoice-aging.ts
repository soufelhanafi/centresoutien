import { monthDateRange } from '../value-objects/month';
import { monthsBetween } from '../value-objects/month';
import { daysBetween } from '../value-objects/date-range';

/**
 * Invoice has no separate `dueDate` field (CLAUDE.md §7: billing is monthly,
 * formula-based, never per session). Moroccan tuition norm is "payable during
 * the month billed", so the one due-date convention this domain needs lives
 * here, once: a billing month is due by its own last calendar day.
 */
export function invoiceDueDate(month: string): string {
  return monthDateRange(month).end;
}

/** Whole civil days elapsed since `dueDate`, clamped to 0 for a not-yet-due invoice. */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, daysBetween(dueDate, today));
}

/**
 * Whole calendar months elapsed since the invoice's billing month, clamped to 0
 * for the current (not-yet-due) month — the "mois de retard" figure on the
 * Impayés follow-up list (SOU-103).
 */
export function monthsOverdue(invoiceMonth: string, currentMonth: string): number {
  return Math.max(0, monthsBetween(invoiceMonth, currentMonth));
}

/** The Impayés aging summary buckets (SOU-103): 0-30 / 31-60 / 61-90 / 90-plus days overdue. */
export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90-plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Buckets a day-count into its aging tier — boundaries fall in the LOWER
 *  bucket (exactly 30 days is `0-30`, exactly 90 is `61-90`), so the three
 *  named cutoffs (30/60/90) each belong to the bucket they close. */
export function agingBucketFor(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90-plus';
}

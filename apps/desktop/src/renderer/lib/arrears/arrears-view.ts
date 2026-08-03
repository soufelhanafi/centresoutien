import type { PaymentStatus } from '@centresoutien/domain';

/** A localized (FR/AR) display name, matching the shape used across the renderer. */
export type LocalizedName = { readonly fr: string; readonly ar: string };

/** Overdue invoices only ever carry one of these two derived payment statuses. */
export type ArrearsPaymentStatus = Extract<PaymentStatus, 'unpaid' | 'partially-paid'>;

/**
 * Three-tier aging schedule (SOU-103 acceptance criteria: "30/60/90 days"):
 * `30` = 1-30 days overdue, `60` = 31-60 days overdue, `90+` = 61 days or more.
 * The bucket is computed server-side from the invoice's billed month against
 * the current month — the renderer never derives it from a raw date.
 */
export type ArrearsAgingBucket = '30' | '60' | '90+';

export const ARREARS_AGING_BUCKETS: readonly ArrearsAgingBucket[] = ['30', '60', '90+'];

/**
 * One overdue/partial invoice under a parent's follow-up list. `groupId` is
 * carried only so the "group" filter can match it server-side — CLAUDE.md §7
 * forbids showing groups as a billing dimension, so the UI never renders it.
 */
export type OverdueInvoiceView = {
  readonly invoiceId: string;
  readonly studentId: string;
  readonly studentName: LocalizedName;
  readonly groupId: string | null;
  readonly month: string;
  readonly outstandingMad: number;
  readonly monthsOverdue: number;
  readonly agingBucket: ArrearsAgingBucket;
  readonly status: ArrearsPaymentStatus;
};

/**
 * One parent's follow-up card: contact info, total due, and every overdue
 * invoice across their children. `parentId`/`parentName`/`parentPhone` are
 * `null` only for a student with no linked guardian yet — the domain still
 * surfaces the debt (in its own group) rather than dropping it, so callers
 * must render a fallback rather than assuming every group has a guardian.
 */
export type ArrearsParentGroupView = {
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly parentPhone: string | null;
  readonly totalOutstandingMad: number;
  readonly oldestAgingBucket: ArrearsAgingBucket;
  readonly invoices: readonly OverdueInvoiceView[];
};

/** Center-wide totals for the aging summary strip. */
export type ArrearsAgingSummaryView = {
  readonly bucket30Mad: number;
  readonly bucket60Mad: number;
  readonly bucket90PlusMad: number;
  readonly totalOutstandingMad: number;
  readonly parentsCount: number;
};

export type ArrearsSummaryView = {
  readonly parents: readonly ArrearsParentGroupView[];
  readonly aging: ArrearsAgingSummaryView;
};

/**
 * Structural + derived filters for the arrears screen. An empty object lists
 * every overdue/partial invoice. `minOutstandingMad` / `maxOutstandingMad`
 * match each individual overdue invoice's outstanding balance, not a parent's
 * `totalOutstandingMad` — a parent stays listed if ANY of their invoices
 * qualifies, and their shown total then reflects only the matching lines.
 */
export type ArrearsFilters = {
  readonly month?: string;
  readonly minOutstandingMad?: number;
  readonly maxOutstandingMad?: number;
  readonly groupId?: string;
  readonly status?: ArrearsPaymentStatus;
};

import type { GroupKind, InvoiceStatus, PaymentStatus } from '@centresoutien/domain';

export type { InvoiceStatus, PaymentStatus };

/** One frozen billing line, mirroring the domain's `InvoiceLine` snapshot fields. */
export type InvoiceLineView = {
  readonly id: string;
  readonly formulaId: string;
  readonly label: { readonly fr: string; readonly ar: string };
  readonly kind: GroupKind;
  readonly amountMad: number;
};

/**
 * One invoice for the list + detail screens (SOU-69). `status` is the stored
 * lifecycle (draft/issued/cancelled); `paymentStatus` is the derived
 * unpaid/partially-paid/paid dimension — the two are intentionally separate
 * fields here (the domain's `InvoiceListItem` names the derived one `status`,
 * which this view avoids to keep both dimensions readable at once).
 */
export type InvoiceListItemView = {
  readonly id: string;
  readonly studentId: string;
  readonly month: string;
  readonly status: InvoiceStatus;
  readonly issuedAt: string | null;
  readonly cancelledAt: string | null;
  readonly lines: readonly InvoiceLineView[];
  readonly totalMad: number;
  readonly netPaidMad: number;
  readonly outstandingMad: number;
  readonly paymentStatus: PaymentStatus;
};

/** Structural + derived filters for the list screen. An empty object lists everything. */
export type InvoiceListFilters = {
  readonly month?: string;
  readonly studentId?: string;
  readonly paymentStatus?: PaymentStatus;
};

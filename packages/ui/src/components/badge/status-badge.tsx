import { Badge, type BadgeProps } from '@ui/components/ui/badge';

/** Invoice / payment lifecycle, mirroring the domain vocabulary. */
export type InvoiceStatusTone = 'draft' | 'paid' | 'partially-paid' | 'cancelled';

// Role mapping from design screen 1a: Brouillon → warning, Payée → success,
// Payée partiellement → info, Annulée → destructive.
const statusVariants: Record<InvoiceStatusTone, NonNullable<BadgeProps['variant']>> = {
  draft: 'warning',
  paid: 'success',
  'partially-paid': 'info',
  cancelled: 'destructive',
};

export type StatusBadgeProps = Omit<BadgeProps, 'variant' | 'dot' | 'children'> & {
  status: InvoiceStatusTone;
  /** Translated label — `packages/ui` holds no i18n. */
  label: string;
};

export function StatusBadge({ status, label, ...props }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status]} shape="pill" dot {...props}>
      {label}
    </Badge>
  );
}

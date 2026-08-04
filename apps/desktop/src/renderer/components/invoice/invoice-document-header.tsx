import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { BilingualText, StatusBadge } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import type { InvoiceListItemView } from '../../lib/invoices/invoice-view';
import { invoiceStatusLabelKey, invoiceStatusTone } from '../../lib/invoices/invoice-status-view';
import { formatDate, formatMonth, formatMonthEnd } from '../../lib/format';
import { useCenterProfile } from '../../hooks/center/use-center-profile';
import { useSavedLogoUrl } from '../../hooks/center/use-saved-logo-url';

/**
 * The document-style invoice header (SOU-162): center branding + identity on the
 * start side, invoice title + status badge + number + issue date on the end side,
 * then a divided bill-to / period / due-date band — mirroring a Stripe invoice.
 * Layout mirrors automatically in RTL via logical properties.
 */
export function InvoiceDocumentHeader({
  invoice,
  student,
}: {
  invoice: InvoiceListItemView;
  student: StudentView | undefined;
}) {
  const { t, i18n } = useTranslation();
  const tone = invoiceStatusTone(invoice);
  const center = useCenterProfile().data?.center ?? null;
  const logo = useSavedLogoUrl(center?.logoPath ?? null);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="space-y-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-3">
            {logo.url !== null ? (
              <img src={logo.url} alt="" aria-hidden="true" className="mt-0.5 h-11 w-11 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-base font-semibold text-foreground">{center?.name ?? '—'}</p>
              {center?.address && <p className="text-sm text-muted-foreground">{center.address}</p>}
              <p className="text-sm text-muted-foreground">
                {[center?.phone, center?.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-end">
            <div className="flex items-center justify-end gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('invoices.detail.documentTitle')}
              </h1>
              <StatusBadge status={tone} label={t(invoiceStatusLabelKey(tone))} />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('invoices.detail.number', { number: invoice.id })}
            </p>
            {invoice.issuedAt !== null && (
              <p className="text-sm text-muted-foreground">
                {t('invoices.detail.issuedOn', { date: formatDate(invoice.issuedAt, i18n.language) })}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('invoices.detail.billedTo')}
            </p>
            <p className="text-sm font-medium text-foreground">
              {student?.name.fr ?? t('invoices.unknownStudent')}
            </p>
            {student && (
              <BilingualText value={student.name.ar} script="arabic" className="block text-xs text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('invoices.detail.period')}
            </p>
            <p className="text-sm font-medium text-foreground">{formatMonth(invoice.month, i18n.language)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('invoices.detail.dueDate')}
            </p>
            <p className="text-sm font-medium text-foreground">{formatMonthEnd(invoice.month, i18n.language)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

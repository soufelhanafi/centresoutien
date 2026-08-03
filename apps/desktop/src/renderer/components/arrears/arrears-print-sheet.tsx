import { useTranslation } from 'react-i18next';
import type { ArrearsParentGroupView } from '../../lib/arrears/arrears-view';
import { formatDate, formatMonth, formatMoneyMad } from '../../lib/format';

type ArrearsPrintSheetProps = {
  parents: readonly ArrearsParentGroupView[];
};

/**
 * The "export list to PDF" quick action's full content — a plain, print-only
 * call sheet for phone follow-up rounds. Hidden on screen, shown only under
 * `@media print` (Tailwind's `print:` variant); the OS print dialog's "Save
 * as PDF" destination is what turns it into a PDF. No custom PDF generation:
 * see the SOU-103 handoff notes for why this stays scoped to the browser
 * print path instead of new pdf-lib infrastructure.
 */
export function ArrearsPrintSheet({ parents }: ArrearsPrintSheetProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="hidden print:block">
      <h1 className="text-lg font-semibold text-foreground">{t('arrears.print.title')}</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('arrears.print.generatedOn', { date: formatDate(new Date().toISOString(), i18n.language) })}
      </p>

      {parents.map((parent) => (
        <section key={parent.parentId} className="mb-4 break-inside-avoid">
          <h2 className="text-sm font-semibold text-foreground">{parent.parentName}</h2>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {parent.parentPhone}
          </p>
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border-b border-border py-1 text-start">{t('arrears.table.student')}</th>
                <th className="border-b border-border py-1 text-start">{t('arrears.table.month')}</th>
                <th className="border-b border-border py-1 text-start">{t('arrears.table.aging')}</th>
                <th className="border-b border-border py-1 text-end">{t('arrears.table.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {parent.invoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td className="py-1">{invoice.studentName.fr}</td>
                  <td className="py-1">{formatMonth(invoice.month, i18n.language)}</td>
                  <td className="py-1">{t(`arrears.aging.bucket.${invoice.agingBucket === '90+' ? 'ninetyPlus' : invoice.agingBucket}`)}</td>
                  <td className="py-1 text-end" dir="ltr">
                    {formatMoneyMad(invoice.outstandingMad, i18n.language)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-1 font-semibold" colSpan={3}>
                  {t('arrears.parentCard.totalOutstanding')}
                </td>
                <td className="pt-1 text-end font-semibold" dir="ltr">
                  {formatMoneyMad(parent.totalOutstandingMad, i18n.language)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

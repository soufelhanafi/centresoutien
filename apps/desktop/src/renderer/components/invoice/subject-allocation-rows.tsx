import { useTranslation } from 'react-i18next';
import { Input, Label, Numeric } from '@centresoutien/ui';
import type { InvoiceSubjectAllocation } from '../../lib/invoices/invoice-view';
import { sumAllocation } from '../../lib/invoices/subject-allocation';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';
import { formatMoneyMad } from '../../lib/format';

type SubjectAllocationRowsProps = {
  idPrefix: string;
  rows: readonly InvoiceSubjectAllocation[];
  totalMad: number;
  nameOf: (subjectId: string) => string;
  onChange: (subjectId: string, centimes: number) => void;
};

/**
 * The per-subject amount inputs of the manual allocation editor (SOU-298), split
 * out from the dialog to keep each file within the size ceilings. Presentational
 * only: the sum-vs-total line and its explanatory hint are informational — the
 * amounts are weights, never gated on summing to the total.
 */
export function SubjectAllocationRows({ idPrefix, rows, totalMad, nameOf, onChange }: SubjectAllocationRowsProps) {
  const { t, i18n } = useTranslation();
  const currentSum = sumAllocation(
    rows.map((row) => ({
      subjectId: row.subjectId,
      amountMad: Number.isFinite(row.amountMad) ? row.amountMad : 0,
    })),
  );

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const inputId = `${idPrefix}-${row.subjectId}`;
        return (
          <div key={row.subjectId} className="flex items-center justify-between gap-3">
            <Label htmlFor={inputId} className="font-normal">
              {nameOf(row.subjectId)}
            </Label>
            <Input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              dir="ltr"
              className="w-32"
              value={Number.isFinite(row.amountMad) ? centimesToMad(row.amountMad) : ''}
              onChange={(event) =>
                onChange(
                  row.subjectId,
                  event.target.value === '' ? Number.NaN : madToCentimes(event.target.valueAsNumber),
                )
              }
            />
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm text-muted-foreground">
        <span>{t('invoices.detail.allocation.sum')}</span>
        <Numeric>
          {t('invoices.detail.allocation.sumOfTotal', {
            sum: formatMoneyMad(currentSum, i18n.language),
            total: formatMoneyMad(totalMad, i18n.language),
          })}
        </Numeric>
      </div>
      {currentSum !== totalMad && (
        <p className="text-xs text-muted-foreground">{t('invoices.detail.allocation.sumMismatchHint')}</p>
      )}
    </div>
  );
}

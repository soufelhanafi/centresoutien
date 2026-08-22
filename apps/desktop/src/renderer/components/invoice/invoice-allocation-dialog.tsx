import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Switch,
  toast,
} from '@centresoutien/ui';
import { useFormulas } from '../../hooks/formula/use-formulas';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { useSetInvoiceAllocation } from '../../hooks/invoice/use-set-invoice-allocation';
import type { InvoiceListItemView, InvoiceSubjectAllocation } from '../../lib/invoices/invoice-view';
import { computeDefaultAllocation } from '../../lib/invoices/subject-allocation';
import { mapInvoiceAllocationWriteError } from '../../lib/invoices/invoice-allocation-write-error';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import { SubjectAllocationRows } from './subject-allocation-rows';

type InvoiceAllocationDialogProps = {
  invoice: InvoiceListItemView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The director's per-invoice manual attribution editor (SOU-298). Off = the
 * weighted default (`subjectAllocation: null`); on = a manual per-subject vector,
 * pre-filled from the formula price-map split so it starts summed to the invoice
 * total. The amounts are WEIGHTS — the sum-vs-total line is a non-blocking hint,
 * never a save gate. Clearing (toggle off + save) returns to the weighted default.
 */
export function InvoiceAllocationDialog({ invoice, open, onOpenChange }: InvoiceAllocationDialogProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const formulas = useFormulas('all');
  const subjects = useSubjects('all');
  const setAllocation = useSetInvoiceAllocation();

  const [manual, setManual] = useState((invoice.subjectAllocation ?? null) !== null);
  const [rows, setRows] = useState<InvoiceSubjectAllocation[]>([]);

  const isLoading = formulas.isPending || subjects.isPending;
  const isError = formulas.isError || subjects.isError;

  useEffect(() => {
    if (!open || isLoading || isError) return;
    const existing = invoice.subjectAllocation ?? null;
    setManual(existing !== null);
    setRows(existing !== null ? existing.map((entry) => ({ ...entry })) : computeDefaultAllocation(invoice, formulas.data ?? []));
  }, [open, isLoading, isError, invoice, formulas.data]);

  const nameOf = (subjectId: string): string => {
    const subject = subjects.data?.find((candidate) => candidate.id === subjectId);
    return subject ? localizedSubjectName(subject.name, i18n.language) : subjectId;
  };

  const setRowAmount = (subjectId: string, centimes: number) =>
    setRows((current) =>
      current.map((row) => (row.subjectId === subjectId ? { ...row, amountMad: centimes } : row)),
    );

  const save = async () => {
    const payload = manual
      ? rows.map((row) => ({
          subjectId: row.subjectId,
          amountMad: Number.isFinite(row.amountMad) ? row.amountMad : 0,
        }))
      : null;
    try {
      await setAllocation.mutateAsync({ invoiceId: invoice.id, allocations: payload });
      toast.success(t('invoices.detail.allocation.success'));
      onOpenChange(false);
    } catch (error) {
      const code = mapInvoiceAllocationWriteError(error);
      toast.error(t(code ? `errors.${code}` : 'invoices.detail.allocation.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} aria-labelledby={headingId}>
        <DialogHeader>
          <DialogTitle id={headingId}>{t('invoices.detail.allocation.title')}</DialogTitle>
          <DialogDescription>{t('invoices.detail.allocation.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex flex-col">
            <Label htmlFor={`${headingId}-manual`} className="font-medium">
              {t('invoices.detail.allocation.manualToggle')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('invoices.detail.allocation.weightedHint')}</p>
          </div>
          <Switch
            id={`${headingId}-manual`}
            checked={manual}
            onCheckedChange={setManual}
            disabled={isLoading || isError}
          />
        </div>

        {manual &&
          (isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1].map((row) => (
                <Skeleton key={row} className="h-9 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">{t('invoices.detail.allocation.loadError')}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('invoices.detail.allocation.empty')}</p>
          ) : (
            <SubjectAllocationRows
              idPrefix={headingId}
              rows={rows}
              totalMad={invoice.totalMad}
              nameOf={nameOf}
              onChange={setRowAmount}
            />
          ))}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('invoices.detail.allocation.cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={setAllocation.isPending || isLoading || isError}>
            {setAllocation.isPending ? t('invoices.detail.allocation.saving') : t('invoices.detail.allocation.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

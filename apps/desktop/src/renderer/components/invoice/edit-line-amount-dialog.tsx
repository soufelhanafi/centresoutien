import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  updateDraftInvoiceLineAmountSchema,
  type UpdateDraftInvoiceLineAmountFields,
} from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  toast,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useUpdateInvoiceLineAmount } from '../../hooks/invoice/use-update-invoice-line-amount';
import type { InvoiceLineView } from '../../lib/invoices/invoice-view';
import { mapInvoiceLineWriteError } from '../../lib/invoices/invoice-line-write-error';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';
import { formatMoneyMad } from '../../lib/format';
import { localizedText } from '../../lib/planning/localized-text';

type EditLineAmountDialogProps = {
  invoiceId: string;
  line: InvoiceLineView | null;
  onClose: () => void;
};

/**
 * Draft-only line amount override (SOU-289): the director sets an arbitrary
 * positive MAD amount on one line of a draft invoice. Non-draft invoices never
 * open this dialog (the table shows no edit affordance).
 */
export function EditLineAmountDialog({ invoiceId, line, onClose }: EditLineAmountDialogProps) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const update = useUpdateInvoiceLineAmount();

  const form = useForm<UpdateDraftInvoiceLineAmountFields>({
    resolver: zodResolver(updateDraftInvoiceLineAmountSchema),
    values: { invoiceId, lineId: line?.id ?? '', amountMad: line?.amountMad ?? Number.NaN },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('invoices.detail.lineEdit.success'));
      onClose();
    } catch (error) {
      const code = mapInvoiceLineWriteError(error);
      if (code === 'invalid-amount') {
        form.setError('amountMad', { message: code });
        return;
      }
      toast.error(t(code ? `errors.${code}` : 'invoices.detail.lineEdit.error'));
    }
  });

  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.detail.lineEdit.title')}</DialogTitle>
          <DialogDescription>
            {line !== null &&
              t('invoices.detail.lineEdit.description', {
                label: localizedText(line.label, i18n.language),
                amount: formatMoneyMad(line.amountMad, i18n.language),
              })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="amountMad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invoices.detail.lineEdit.amount')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      dir="ltr"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={Number.isNaN(field.value) ? '' : centimesToMad(field.value)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === '' ? Number.NaN : madToCentimes(event.target.valueAsNumber),
                        )
                      }
                    />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('invoices.detail.lineEdit.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={update.isPending}>
            {update.isPending ? t('invoices.detail.lineEdit.saving') : t('invoices.detail.lineEdit.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

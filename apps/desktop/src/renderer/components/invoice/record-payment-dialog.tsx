import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { recordPaymentSchema, PAYMENT_METHODS, type RecordPaymentFields } from '@centresoutien/domain';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useFeature } from '../../hooks/use-feature';
import { useUpgradeCta } from '../../hooks/use-upgrade-prompt';
import { useRecordPayment } from '../../hooks/invoice/use-record-payment';
import { mapPaymentWriteError } from '../../lib/invoices/payment-write-error';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';

const today = () => new Date().toISOString().slice(0, 10);

/** Pre-transform shape RHF holds (blank note), vs the parsed `RecordPaymentFields` output. */
type RecordPaymentFormInput = z.input<typeof recordPaymentSchema>;

type RecordPaymentDialogProps = {
  invoiceId: string;
  outstandingMad: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** "Mark paid" flow: records a payment against the invoice's outstanding balance. */
export function RecordPaymentDialog({ invoiceId, outstandingMad, open, onOpenChange }: RecordPaymentDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const canPartialPay = useFeature('core.invoicing.partial-paid');
  const upgradeCta = useUpgradeCta('core.invoicing.partial-paid');
  const record = useRecordPayment();

  const form = useForm<RecordPaymentFormInput, unknown, RecordPaymentFields>({
    resolver: zodResolver(recordPaymentSchema),
    values: { invoiceId, amountMad: outstandingMad, method: 'cash', paidOn: today(), note: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await record.mutateAsync(canPartialPay ? values : { ...values, amountMad: outstandingMad });
      toast.success(t('invoices.detail.payment.success'));
      onOpenChange(false);
    } catch (error) {
      const code = mapPaymentWriteError(error);
      if (code === 'payment-exceeds-balance') {
        form.setError('amountMad', { message: code });
        return;
      }
      toast.error(t('invoices.detail.payment.error'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.detail.payment.title')}</DialogTitle>
          <DialogDescription>{t('invoices.detail.payment.description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="amountMad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invoices.detail.payment.amount')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      dir="ltr"
                      disabled={!canPartialPay}
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
                  {!canPartialPay && (
                    <p className="text-xs text-muted-foreground">
                      {t('invoices.detail.payment.partialLocked')}{' '}
                      <button
                        type="button"
                        onClick={upgradeCta.onCta}
                        className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {upgradeCta.ctaLabel}
                      </button>
                    </p>
                  )}
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invoices.detail.payment.method')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {t(`invoices.detail.payment.methods.${method}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paidOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invoices.detail.payment.paidOn')}</FormLabel>
                  <FormControl>
                    <Input type="date" dir="ltr" {...field} />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('invoices.detail.payment.note')}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('invoices.detail.payment.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={record.isPending}>
            {record.isPending ? t('invoices.detail.payment.saving') : t('invoices.detail.payment.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

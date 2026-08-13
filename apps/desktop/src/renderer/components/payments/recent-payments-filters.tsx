import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS, type PaymentMethod } from '@centresoutien/domain';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';

/** The `all` sentinel as the method Select's string value (Radix Select needs strings). */
export const ALL_METHODS = 'all';

export type RecentPaymentsFilterState = {
  readonly from: string;
  readonly to: string;
  readonly method: PaymentMethod | typeof ALL_METHODS;
};

export const EMPTY_RECENT_PAYMENTS_FILTERS: RecentPaymentsFilterState = {
  from: '',
  to: '',
  method: ALL_METHODS,
};

export function hasActiveRecentPaymentsFilters(state: RecentPaymentsFilterState): boolean {
  return state.from !== '' || state.to !== '' || state.method !== ALL_METHODS;
}

/**
 * Filter bar for the "Derniers encaissements" feed (SOU-225): an inclusive `paidOn`
 * day window plus a payment-method select. Date inputs stay `dir="ltr"` in both
 * locales so the browser's `YYYY-MM-DD` picker keeps its native layout, matching the
 * holiday form; everything else follows the ambient direction via logical spacing.
 */
export function RecentPaymentsFilters({
  value,
  onChange,
}: {
  value: RecentPaymentsFilterState;
  onChange: (next: RecentPaymentsFilterState) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 basis-40 space-y-1">
        <Label htmlFor="recent-payments-from">{t('payments.feed.filters.from')}</Label>
        <Input
          id="recent-payments-from"
          type="date"
          dir="ltr"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>

      <div className="flex-1 basis-40 space-y-1">
        <Label htmlFor="recent-payments-to">{t('payments.feed.filters.to')}</Label>
        <Input
          id="recent-payments-to"
          type="date"
          dir="ltr"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>

      <div className="flex-1 basis-40 space-y-1">
        <Label htmlFor="recent-payments-method">{t('payments.feed.filters.method')}</Label>
        <Select
          value={value.method}
          onValueChange={(next) =>
            onChange({ ...value, method: next as PaymentMethod | typeof ALL_METHODS })
          }
        >
          <SelectTrigger id="recent-payments-method" aria-label={t('payments.feed.filters.method')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_METHODS}>{t('payments.feed.filters.allMethods')}</SelectItem>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {t(`invoices.detail.payment.methods.${method}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveRecentPaymentsFilters(value) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_RECENT_PAYMENTS_FILTERS)}
        >
          {t('payments.feed.filters.reset')}
        </Button>
      )}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@centresoutien/ui';
import type { ArrearsPaymentStatus } from '../../lib/arrears/arrears-view';
import type { GroupRow } from '../../lib/groups/group-view';
import { localizedName } from '../../lib/groups/localized-name';
import { centimesToMad, madToCentimes } from '../../lib/formulas/price-mad';

const ALL = '__all__';
const ARREARS_STATUSES: readonly ArrearsPaymentStatus[] = ['unpaid', 'partially-paid'];

type ArrearsToolbarProps = {
  month: string;
  onMonthChange: (value: string) => void;
  minOutstandingMad: number | null;
  onMinOutstandingChange: (value: number | null) => void;
  maxOutstandingMad: number | null;
  onMaxOutstandingChange: (value: number | null) => void;
  groupId: string;
  onGroupIdChange: (value: string) => void;
  groups: readonly GroupRow[];
  status: ArrearsPaymentStatus | '';
  onStatusChange: (value: ArrearsPaymentStatus | '') => void;
};

/** Month / amount-range / group / derived-status filters for the arrears follow-up list. */
export function ArrearsToolbar({
  month,
  onMonthChange,
  minOutstandingMad,
  onMinOutstandingChange,
  maxOutstandingMad,
  onMaxOutstandingChange,
  groupId,
  onGroupIdChange,
  groups,
  status,
  onStatusChange,
}: ArrearsToolbarProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Input
        type="month"
        dir="ltr"
        value={month}
        onChange={(event) => onMonthChange(event.target.value)}
        aria-label={t('arrears.filters.monthLabel')}
        className="sm:w-44"
      />

      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          dir="ltr"
          value={minOutstandingMad === null ? '' : centimesToMad(minOutstandingMad)}
          onChange={(event) =>
            onMinOutstandingChange(event.target.value === '' ? null : madToCentimes(event.target.valueAsNumber))
          }
          placeholder={t('arrears.filters.amountMin')}
          aria-label={t('arrears.filters.amountMinLabel')}
          className="w-28"
        />
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          –
        </span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          dir="ltr"
          value={maxOutstandingMad === null ? '' : centimesToMad(maxOutstandingMad)}
          onChange={(event) =>
            onMaxOutstandingChange(event.target.value === '' ? null : madToCentimes(event.target.valueAsNumber))
          }
          placeholder={t('arrears.filters.amountMax')}
          aria-label={t('arrears.filters.amountMaxLabel')}
          className="w-28"
        />
      </div>

      <Select value={groupId === '' ? ALL : groupId} onValueChange={(value) => onGroupIdChange(value === ALL ? '' : value)}>
        <SelectTrigger className="sm:w-52" aria-label={t('arrears.filters.groupLabel')}>
          <SelectValue placeholder={t('arrears.filters.groupAll')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('arrears.filters.groupAll')}</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {localizedName(group.subjectName, i18n.language)} — {group.level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status === '' ? ALL : status}
        onValueChange={(value) => onStatusChange(value === ALL ? '' : (value as ArrearsPaymentStatus))}
      >
        <SelectTrigger className="sm:w-48" aria-label={t('arrears.filters.statusLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('arrears.filters.statusAll')}</SelectItem>
          {ARREARS_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`invoices.status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

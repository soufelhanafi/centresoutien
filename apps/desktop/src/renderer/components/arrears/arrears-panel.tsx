import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useArrears } from '../../hooks/arrears/use-arrears';
import { useGroups } from '../../hooks/group/use-groups';
import type { ArrearsPaymentStatus } from '../../lib/arrears/arrears-view';
import { ArrearsToolbar } from './arrears-toolbar';
import { ArrearsAgingSummary } from './arrears-aging-summary';
import { ArrearsListContent, type ArrearsListStatus } from './arrears-list-content';
import { ArrearsPrintSheet } from './arrears-print-sheet';

const EMPTY_AGING = { bucket30Mad: 0, bucket60Mad: 0, bucket90PlusMad: 0, totalOutstandingMad: 0, parentsCount: 0 };

/**
 * Impayés module (SOU-103, relocated in SOU-224): overdue/partial invoices
 * grouped by parent, aging summary, follow-up quick actions. Now the third tab
 * panel of the Caisse (payments) page — `TabsContent` unmounts the inactive
 * panel, so `useArrears` only fires once this tab is selected. The panel owns
 * its own `<h2>` sub-header under the page `<h1>`, and every on-screen element
 * carries `print:hidden` so the "export list to PDF" action prints only the
 * `ArrearsPrintSheet`.
 */
export function ArrearsPanel() {
  const { t } = useTranslation();
  const titleId = useId();
  const [month, setMonth] = useState('');
  const [minOutstandingMad, setMinOutstandingMad] = useState<number | null>(null);
  const [maxOutstandingMad, setMaxOutstandingMad] = useState<number | null>(null);
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<ArrearsPaymentStatus | ''>('');

  const query = useArrears({
    ...(month !== '' && { month }),
    ...(minOutstandingMad !== null && { minOutstandingMad }),
    ...(maxOutstandingMad !== null && { maxOutstandingMad }),
    ...(groupId !== '' && { groupId }),
    ...(status !== '' && { status }),
  });
  const groupsQuery = useGroups('active');

  const parents = useMemo(() => query.data?.parents ?? [], [query.data]);
  const isFiltered =
    month !== '' || minOutstandingMad !== null || maxOutstandingMad !== null || groupId !== '' || status !== '';

  const listStatus: ArrearsListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : parents.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  return (
    <section aria-labelledby={titleId} className="flex w-full flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="space-y-1">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {t('arrears.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('arrears.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={parents.length === 0}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t('arrears.actions.exportList')}
        </Button>
      </header>

      <div className="print:hidden">
        <ArrearsAgingSummary aging={query.data?.aging ?? EMPTY_AGING} />
      </div>

      <div className="print:hidden">
        <ArrearsToolbar
          month={month}
          onMonthChange={setMonth}
          minOutstandingMad={minOutstandingMad}
          onMinOutstandingChange={setMinOutstandingMad}
          maxOutstandingMad={maxOutstandingMad}
          onMaxOutstandingChange={setMaxOutstandingMad}
          groupId={groupId}
          onGroupIdChange={setGroupId}
          groups={groupsQuery.data ?? []}
          status={status}
          onStatusChange={setStatus}
        />
      </div>

      <ArrearsListContent status={listStatus} parents={parents} onRetry={() => void query.refetch()} />

      <ArrearsPrintSheet parents={parents} />
    </section>
  );
}

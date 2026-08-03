import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useArrears } from '../../hooks/arrears/use-arrears';
import { useGroups } from '../../hooks/group/use-groups';
import type { ArrearsPaymentStatus } from '../../lib/arrears/arrears-view';
import { ArrearsToolbar } from '../../components/arrears/arrears-toolbar';
import { ArrearsAgingSummary } from '../../components/arrears/arrears-aging-summary';
import { ArrearsListContent, type ArrearsListStatus } from '../../components/arrears/arrears-list-content';
import { ArrearsPrintSheet } from '../../components/arrears/arrears-print-sheet';

const EMPTY_AGING = { bucket30Mad: 0, bucket60Mad: 0, bucket90PlusMad: 0, totalOutstandingMad: 0, parentsCount: 0 };

/** Impayés module (SOU-103): overdue/partial invoices grouped by parent, aging summary, follow-up quick actions. */
export function ArrearsPage() {
  const { t } = useTranslation();
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
    <section aria-labelledby="arrears-title" className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="space-y-1">
          <h1 id="arrears-title" className="text-xl font-semibold text-foreground">
            {t('arrears.title')}
          </h1>
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

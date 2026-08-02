import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { FormulaView } from '../../lib/formulas/formula-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { SubscriptionView } from '../../lib/subscriptions/subscription-view';
import { SubscriptionHistoryRow } from './subscription-history-row';

const COLUMNS = ['0.9fr', '1.6fr', '1.3fr'] as const;

/** A student's closed subscriptions, oldest last (`history` arrives pre-sorted). */
export function SubscriptionHistoryTable({
  history,
  formulas,
  subjects,
}: {
  history: readonly SubscriptionView[];
  formulas: readonly FormulaView[];
  subjects: readonly SubjectView[];
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('students.subscription.history.table.kind')}</DataTableHead>
            <DataTableHead>{t('students.subscription.history.table.formula')}</DataTableHead>
            <DataTableHead>{t('students.subscription.history.table.period')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {history.map((subscription) => (
            <SubscriptionHistoryRow
              key={subscription.id}
              subscription={subscription}
              formulas={formulas}
              subjects={subjects}
            />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

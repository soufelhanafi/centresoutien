import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { TeacherAttributionBreakdownEntryView, TeacherPayoutView } from '../../lib/payroll/teacher-payout-view';
import { PayrollRow } from './payroll-row';
import { PayrollBreakdownRow } from './payroll-breakdown-row';

const COLUMNS = ['1.8fr', '1.3fr', '1fr', '1fr', '1fr', '1.2fr'] as const;

type PayrollTableProps = {
  payouts: readonly TeacherPayoutView[];
  teachersById: ReadonlyMap<string, TeacherView>;
  subjectsById: ReadonlyMap<string, SubjectView>;
  breakdownByTeacher: ReadonlyMap<string, readonly TeacherAttributionBreakdownEntryView[]>;
};

/** The payroll dashboard's list: one row per teacher payout, expandable to the subject drill-down. */
export function PayrollTable({ payouts, teachersById, subjectsById, breakdownByTeacher }: PayrollTableProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (payoutId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(payoutId)) {
        next.delete(payoutId);
      } else {
        next.add(payoutId);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('payroll.table.teacher')}</DataTableHead>
            <DataTableHead>{t('payroll.table.ruleKind')}</DataTableHead>
            <DataTableHead>{t('payroll.table.baseAmount')}</DataTableHead>
            <DataTableHead>{t('payroll.table.total')}</DataTableHead>
            <DataTableHead>{t('payroll.table.status')}</DataTableHead>
            <DataTableHead>{t('payroll.table.actions')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {payouts.map((payout) => {
            const expanded = expandedIds.has(payout.id);
            return (
              <Fragment key={payout.id}>
                <PayrollRow
                  payout={payout}
                  teacher={teachersById.get(payout.teacherId)}
                  expanded={expanded}
                  onToggleExpand={() => toggleExpanded(payout.id)}
                />
                {expanded && (
                  <PayrollBreakdownRow
                    columnsCount={COLUMNS.length}
                    entries={breakdownByTeacher.get(payout.teacherId) ?? []}
                    subjectsById={subjectsById}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { SubjectStatus, SubjectUsageView } from '../../lib/subjects/subject-view';
import { SubjectRow } from './subject-row';

const COLUMNS = ['0.7fr', '1.6fr', '0.9fr', '0.9fr', '96px'] as const;

/** The subjects list as an accessible grid-styled table, mirroring `TeacherTable`. */
export function SubjectTable({
  subjects,
  variant,
}: {
  subjects: readonly SubjectUsageView[];
  variant: SubjectStatus;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('subjects.table.code')}</DataTableHead>
            <DataTableHead>{t('subjects.table.name')}</DataTableHead>
            <DataTableHead>{t('subjects.table.state')}</DataTableHead>
            <DataTableHead>{t('subjects.table.inUse')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('subjects.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {subjects.map((usage) => (
            <SubjectRow key={usage.subject.id} usage={usage} variant={variant} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

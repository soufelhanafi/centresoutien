import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherRow } from './teacher-row';

const COLUMNS = ['1.6fr', '1.2fr', '1fr', '0.9fr', '56px'] as const;

/** The teachers list as an accessible grid-styled table (design 1a geometry). */
export function TeacherTable({ teachers }: { teachers: readonly TeacherView[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('teachers.table.name')}</DataTableHead>
            <DataTableHead>{t('teachers.table.phone')}</DataTableHead>
            <DataTableHead>{t('teachers.table.cin')}</DataTableHead>
            <DataTableHead>{t('teachers.table.subjects')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('teachers.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <TeacherRow key={teacher.id} teacher={teacher} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

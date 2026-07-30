import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { StudentRow } from './student-row';

const COLUMNS = ['1.6fr', '1fr', '1.4fr', '0.9fr', '56px'] as const;

/** The students list as an accessible grid-styled table (design 1a geometry). */
export function StudentTable({ students }: { students: readonly StudentView[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('students.table.name')}</DataTableHead>
            <DataTableHead>{t('students.table.level')}</DataTableHead>
            <DataTableHead>{t('students.table.school')}</DataTableHead>
            <DataTableHead>{t('students.table.guardians')}</DataTableHead>
            <DataTableHead className="text-end">
              <span className="sr-only">{t('students.table.actions')}</span>
            </DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {students.map((student) => (
            <StudentRow key={student.id} student={student} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

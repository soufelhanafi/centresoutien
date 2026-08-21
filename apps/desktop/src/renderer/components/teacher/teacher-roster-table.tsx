import { useTranslation } from 'react-i18next';
import { DataTable, DataTableHead, DataTableRow } from '@centresoutien/ui';
import type { TeacherRosterEntryView } from '../../lib/teachers/teacher-roster-view';
import { TeacherRosterRow } from './teacher-roster-row';

const COLUMNS = ['1.5fr', '1.2fr', '1.2fr', '0.9fr', '0.9fr'] as const;

/** The teacher's filtered student roster as an accessible grid-styled table. */
export function TeacherRosterTable({ roster }: { roster: readonly TeacherRosterEntryView[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <DataTable columns={COLUMNS}>
        <thead>
          <DataTableRow>
            <DataTableHead>{t('teachers.detail.students.table.name')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.students.table.subjects')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.students.table.formula')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.students.table.kind')}</DataTableHead>
            <DataTableHead>{t('teachers.detail.students.table.status')}</DataTableHead>
          </DataTableRow>
        </thead>
        <tbody>
          {roster.map((entry) => (
            <TeacherRosterRow key={entry.studentId} entry={entry} />
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

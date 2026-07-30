import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BilingualText, DataTableCell, DataTableRow } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { StudentRowActions } from './student-row-actions';

/** One student row: bilingual name (FR + AR), level, school, guardian count, actions. */
export function StudentRow({ student }: { student: StudentView }) {
  const { t } = useTranslation();

  return (
    <DataTableRow>
      <DataTableCell>
        <Link
          to="/students/$studentId"
          params={{ studentId: student.id }}
          className="font-medium text-foreground hover:underline"
        >
          {student.name.fr}
        </Link>
        <BilingualText
          value={student.name.ar}
          script="arabic"
          className="mt-0.5 block text-xs text-muted-foreground"
        />
      </DataTableCell>
      <DataTableCell>{student.level}</DataTableCell>
      <DataTableCell>{student.school ?? t('students.info.none')}</DataTableCell>
      <DataTableCell className="text-muted-foreground">
        {t('students.guardiansCount', { count: student.guardianIds.length })}
      </DataTableCell>
      <DataTableCell className="text-end">
        <StudentRowActions student={student} />
      </DataTableCell>
    </DataTableRow>
  );
}

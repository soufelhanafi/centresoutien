import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BilingualText, DataTableCell, DataTableRow } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherRowActions } from './teacher-row-actions';

/** One teacher row: bilingual name (FR + AR), phone, CIN, subject count, actions. */
export function TeacherRow({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();

  return (
    <DataTableRow>
      <DataTableCell>
        <Link
          to="/teachers/$teacherId"
          params={{ teacherId: teacher.id }}
          className="font-medium text-foreground hover:underline"
        >
          {teacher.name.fr}
        </Link>
        <BilingualText
          value={teacher.name.ar}
          script="arabic"
          className="mt-0.5 block text-xs text-muted-foreground"
        />
      </DataTableCell>
      <DataTableCell>
        <span dir="ltr" className="tabular-nums">
          {teacher.phone}
        </span>
      </DataTableCell>
      <DataTableCell>{teacher.cin ?? t('teachers.info.none')}</DataTableCell>
      <DataTableCell className="text-muted-foreground">
        {t('teachers.subjectsCount', { count: teacher.subjectIds.length })}
      </DataTableCell>
      <DataTableCell className="text-end">
        <TeacherRowActions teacher={teacher} />
      </DataTableCell>
    </DataTableRow>
  );
}

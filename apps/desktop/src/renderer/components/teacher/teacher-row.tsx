import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BilingualText, DataTableCell, DataTableRow } from '@centresoutien/ui';
import type { TeacherStatus, TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherRowActions } from './teacher-row-actions';

/**
 * One teacher row: bilingual name (FR + AR), phone, CIN, subject count, actions.
 * Active rows link to the detail sheet; archived rows show the name as plain text
 * (their only action is restore), mirroring the Rooms list.
 */
export function TeacherRow({ teacher, variant }: { teacher: TeacherView; variant: TeacherStatus }) {
  const { t } = useTranslation();

  return (
    <DataTableRow>
      <DataTableCell>
        {variant === 'archived' ? (
          <span className="font-medium text-foreground">{teacher.name.fr}</span>
        ) : (
          <Link
            to="/teachers/$teacherId"
            params={{ teacherId: teacher.id }}
            className="font-medium text-foreground hover:underline"
          >
            {teacher.name.fr}
          </Link>
        )}
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
        <TeacherRowActions teacher={teacher} variant={variant} />
      </DataTableCell>
    </DataTableRow>
  );
}

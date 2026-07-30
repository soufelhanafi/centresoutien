import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Archive, SquarePen } from 'lucide-react';
import { Badge, BilingualText, Button } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { EditStudentSheet } from './edit-student-sheet';
import { ArchiveStudentDialog } from './archive-student-dialog';

/** Detail-page header: back link, bilingual name, archived badge, edit + archive. */
export function StudentDetailHeader({
  student,
  onArchived,
}: {
  student: StudentView;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <header className="flex flex-col gap-4">
      <Link
        to="/students"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t('students.detail.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{student.name.fr}</h1>
            {student.archived && <Badge variant="neutral">{t('students.detail.archivedBadge')}</Badge>}
          </div>
          <BilingualText value={student.name.ar} script="arabic" className="text-sm text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('students.detail.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('students.row.archive')}
          </Button>
        </div>
      </div>

      <EditStudentSheet student={student} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveStudentDialog
        student={student}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={onArchived}
      />
    </header>
  );
}

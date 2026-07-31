import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Archive, SquarePen } from 'lucide-react';
import { Badge, BilingualText, Button } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { EditTeacherSheet } from './edit-teacher-sheet';
import { ArchiveTeacherDialog } from './archive-teacher-dialog';

/** Detail-page header: back link, bilingual name, archived badge, edit + archive. */
export function TeacherDetailHeader({
  teacher,
  onArchived,
}: {
  teacher: TeacherView;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <header className="flex flex-col gap-4">
      <Link
        to="/teachers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t('teachers.detail.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{teacher.name.fr}</h1>
            {teacher.archived && <Badge variant="neutral">{t('teachers.detail.archivedBadge')}</Badge>}
          </div>
          <BilingualText value={teacher.name.ar} script="arabic" className="text-sm text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('teachers.detail.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('teachers.row.archive')}
          </Button>
        </div>
      </div>

      <EditTeacherSheet teacher={teacher} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveTeacherDialog
        teacher={teacher}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={onArchived}
      />
    </header>
  );
}

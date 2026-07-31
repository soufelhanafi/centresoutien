import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, SquarePen, Archive, Eye } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { EditTeacherSheet } from './edit-teacher-sheet';
import { ArchiveTeacherDialog } from './archive-teacher-dialog';

/** Per-row actions menu. Owns its own edit-drawer and archive-dialog state. */
export function TeacherRowActions({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const open = () => navigate({ to: '/teachers/$teacherId', params: { teacherId: teacher.id } });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('teachers.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={open}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t('teachers.row.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('teachers.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('teachers.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditTeacherSheet teacher={teacher} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveTeacherDialog teacher={teacher} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}

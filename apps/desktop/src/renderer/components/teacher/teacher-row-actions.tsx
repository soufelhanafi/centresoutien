import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontal, SquarePen, Archive, Eye, RotateCcw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { TeacherStatus, TeacherView } from '../../lib/teachers/teacher-view';
import { useRestoreTeacher } from '../../hooks/teacher/use-restore-teacher';
import { EditTeacherSheet } from './edit-teacher-sheet';
import { ArchiveTeacherDialog } from './archive-teacher-dialog';

/**
 * Per-row actions. Active teachers get an open/edit/archive menu; archived
 * teachers get a single restore button. The `variant` (never the row's own flag)
 * decides, so each list renders exactly the actions that make sense for it —
 * mirroring `RoomRowActions`.
 */
export function TeacherRowActions({
  teacher,
  variant,
}: {
  teacher: TeacherView;
  variant: TeacherStatus;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const restore = useRestoreTeacher();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const open = () => navigate({ to: '/teachers/$teacherId', params: { teacherId: teacher.id } });

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(teacher.id);
      toast.success(t('teachers.restore.success'));
    } catch {
      toast.error(t('teachers.restore.error'));
    }
  };

  if (variant === 'archived') {
    return (
      <Button variant="outline" size="sm" disabled={restore.isPending} onClick={handleRestore}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('teachers.row.restore')}
      </Button>
    );
  }

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

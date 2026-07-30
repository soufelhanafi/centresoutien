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
import type { StudentView } from '../../lib/students/student-view';
import { EditStudentSheet } from './edit-student-sheet';
import { ArchiveStudentDialog } from './archive-student-dialog';

/** Per-row actions menu. Owns its own edit-drawer and archive-dialog state. */
export function StudentRowActions({ student }: { student: StudentView }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const open = () => navigate({ to: '/students/$studentId', params: { studentId: student.id } });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('students.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={open}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t('students.row.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('students.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('students.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditStudentSheet student={student} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveStudentDialog student={student} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, SquarePen, Power, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@centresoutien/ui';
import type { SubjectStatus, SubjectUsageView } from '../../lib/subjects/subject-view';
import { useUpdateSubject } from '../../hooks/subject/use-update-subject';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import { EditSubjectDialog } from './edit-subject-dialog';
import { DeleteSubjectDialog } from './delete-subject-dialog';

/**
 * Per-row actions. Inactive rows get a single "Réactiver" button (reversible,
 * no confirmation — mirrors `TeacherRowActions`'s restore). Active rows get a
 * menu: rename, an instant reversible "Désactiver", and "Supprimer" — the latter
 * always opens {@link DeleteSubjectDialog}, which itself shows the blocked view
 * when `canDelete` is false. In that case the item is visually muted and carries
 * `aria-disabled` (so assistive tech announces the disabled state, per the AC),
 * but keeps the native `disabled` attribute off so its tooltip stays reachable
 * and clicking still opens the informative modal instead of doing nothing —
 * friendlier for a low-tech-literacy user than a silently inert control.
 */
export function SubjectRowActions({ usage, variant }: { usage: SubjectUsageView; variant: SubjectStatus }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateSubject(usage.subject.id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = localizedSubjectName(usage.subject.name, i18n.language);

  const setActive = async (active: boolean) => {
    try {
      await update.mutateAsync({ name: usage.subject.name, active });
      toast.success(t(active ? 'subjects.activate.success' : 'subjects.deactivate.success'));
    } catch {
      toast.error(t(active ? 'subjects.activate.error' : 'subjects.deactivate.error'));
    }
  };

  if (variant === 'inactive') {
    return (
      <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => setActive(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('subjects.row.activate')}
      </Button>
    );
  }

  const deleteItem = (
    <DropdownMenuItem
      variant="destructive"
      aria-disabled={!usage.canDelete}
      className={usage.canDelete ? undefined : 'opacity-60'}
      onSelect={() => setDeleteOpen(true)}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {t('subjects.row.delete')}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('subjects.row.menu', { name })}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('subjects.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={update.isPending} onSelect={() => setActive(false)}>
            <Power className="h-4 w-4" aria-hidden="true" />
            {t('subjects.row.deactivate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {usage.canDelete ? (
            deleteItem
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>{deleteItem}</TooltipTrigger>
              <TooltipContent>
                {t('subjects.row.deleteBlockedHint', { count: usage.inUseCount })}
              </TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditSubjectDialog subject={usage.subject} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteSubjectDialog usage={usage} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}

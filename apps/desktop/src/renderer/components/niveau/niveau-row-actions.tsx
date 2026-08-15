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
import { useUpdateNiveau } from '../../hooks/niveau/use-update-niveau';
import { localizedNiveauName } from '../../lib/niveaux/niveau-view';
import type { NiveauUsageView } from '../../lib/niveaux/niveau-view';
import { totalNiveauUsage } from '../../lib/niveaux/grouping';
import { EditNiveauDialog } from './edit-niveau-dialog';
import { DeleteNiveauDialog } from './delete-niveau-dialog';
import { DeactivateNiveauDialog } from './deactivate-niveau-dialog';

/**
 * Per-row actions. Inactive rows get a single "Réactiver" button (reversible, no
 * confirmation — mirrors `SubjectRowActions`). Active rows get a menu: rename,
 * "Désactiver", and "Supprimer". A referenced niveau (any usage count > 0) opens
 * the in-use warning dialog before deactivating; a free one deactivates instantly
 * with a toast. The in-use item is deliberately NOT marked disabled — it remains a
 * working control whose dialog explains the references. Delete always opens
 * {@link DeleteNiveauDialog}, which itself shows the blocked view when
 * `canDelete` is false (mirrors `SubjectRowActions`' delete).
 */
export function NiveauRowActions({ usage }: { usage: NiveauUsageView }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateNiveau(usage.niveau.id);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const name = localizedNiveauName(usage.niveau.name, i18n.language);
  const inUse = totalNiveauUsage(usage) > 0;

  const setActive = async (active: boolean) => {
    try {
      await update.mutateAsync({
        name: usage.niveau.name,
        code: usage.niveau.code ?? undefined,
        category: usage.niveau.category,
        active,
      });
      toast.success(t(active ? 'niveaux.activate.success' : 'niveaux.deactivate.success'));
    } catch {
      toast.error(t(active ? 'niveaux.activate.error' : 'niveaux.deactivate.error'));
    }
  };

  if (!usage.niveau.active) {
    return (
      <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => setActive(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('niveaux.row.activate')}
      </Button>
    );
  }

  const deactivateItem = (
    <DropdownMenuItem
      disabled={update.isPending}
      onSelect={() => (inUse ? setDeactivateOpen(true) : void setActive(false))}
    >
      <Power className="h-4 w-4" aria-hidden="true" />
      {t('niveaux.row.deactivate')}
    </DropdownMenuItem>
  );

  const deleteItem = (
    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      {t('niveaux.row.delete')}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('niveaux.row.menu', { name })}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('niveaux.row.edit')}
          </DropdownMenuItem>
          {inUse ? (
            <Tooltip>
              <TooltipTrigger asChild>{deactivateItem}</TooltipTrigger>
              <TooltipContent>{t('niveaux.row.deactivateBlockedHint')}</TooltipContent>
            </Tooltip>
          ) : (
            deactivateItem
          )}
          <DropdownMenuSeparator />
          {usage.canDelete ? (
            deleteItem
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>{deleteItem}</TooltipTrigger>
              <TooltipContent>
                {t('niveaux.row.deleteBlockedHint', { count: usage.inUseCount })}
              </TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditNiveauDialog niveau={usage.niveau} open={editOpen} onOpenChange={setEditOpen} />
      <DeactivateNiveauDialog usage={usage} open={deactivateOpen} onOpenChange={setDeactivateOpen} />
      <DeleteNiveauDialog usage={usage} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}

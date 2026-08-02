import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, SquarePen, Copy, Power } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { FormulaStatus, FormulaView } from '../../lib/formulas/formula-view';
import { useCloneFormula } from '../../hooks/formula/use-clone-formula';
import { localizedFormulaName } from '../../lib/formulas/localized-name';
import { EditFormulaDialog } from './edit-formula-dialog';
import { DeactivateFormulaDialog } from './deactivate-formula-dialog';

/**
 * Per-row actions: "Modifier" (disabled with a tooltip once `isImmutable` —
 * the domain rejects every patch on a used formula), "Dupliquer" (clone, then
 * open the same edit dialog on the fresh mutable copy so a price change never
 * needs a second trip through the row menu), and — active rows only —
 * "Désactiver", wired to the dedicated one-directional `deactivateFormula`
 * channel rather than the generic update path (KICKOFF, SOU-62).
 */
export function FormulaRowActions({ formula, variant }: { formula: FormulaView; variant: FormulaStatus }) {
  const { t, i18n } = useTranslation();
  const clone = useCloneFormula();
  const [editTarget, setEditTarget] = useState<FormulaView | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const name = localizedFormulaName(formula.name, i18n.language);

  const handleClone = async () => {
    try {
      const cloned = await clone.mutateAsync(formula.id);
      toast.success(t('formulas.clone.success'));
      setEditTarget(cloned);
    } catch {
      toast.error(t('formulas.clone.error'));
    }
  };

  const editItem = (
    <DropdownMenuItem
      className={formula.isImmutable ? 'opacity-60' : undefined}
      onSelect={() => {
        if (!formula.isImmutable) setEditTarget(formula);
      }}
    >
      <SquarePen className="h-4 w-4" aria-hidden="true" />
      {t('formulas.row.edit')}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('formulas.row.menu', { name })}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {formula.isImmutable ? (
            <Tooltip>
              <TooltipTrigger asChild>{editItem}</TooltipTrigger>
              <TooltipContent>{t('formulas.row.editLockedHint')}</TooltipContent>
            </Tooltip>
          ) : (
            editItem
          )}
          <DropdownMenuItem disabled={clone.isPending} onSelect={handleClone}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {t('formulas.row.clone')}
          </DropdownMenuItem>
          {variant === 'active' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeactivateOpen(true)}>
                <Power className="h-4 w-4" aria-hidden="true" />
                {t('formulas.row.deactivate')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editTarget && (
        <EditFormulaDialog
          formula={editTarget}
          open={editTarget !== null}
          onOpenChange={(next) => {
            if (!next) setEditTarget(null);
          }}
        />
      )}
      <DeactivateFormulaDialog formula={formula} open={deactivateOpen} onOpenChange={setDeactivateOpen} />
    </>
  );
}

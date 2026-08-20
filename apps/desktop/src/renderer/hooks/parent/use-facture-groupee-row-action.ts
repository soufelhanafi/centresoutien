import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useParentStatementActions } from './use-parent-statement-actions';
import { resolveFactureGroupee, type FactureGroupeeResolution } from '../../lib/invoices/facture-groupee';

type PendingAction = 'print' | 'export';

export type FactureGroupeeRowActionState = {
  resolution: FactureGroupeeResolution;
  isPending: boolean;
  pendingAction: PendingAction | null;
  trigger: (action: PendingAction) => void;
  pick: (parentId: string) => void;
  closePicker: () => void;
};

// Orchestrates the per-row "Facture groupée" action (SOU-284): resolves the row
// student's guardians, then prints or exports the consolidated PDF for the chosen
// guardian and the screen's active month. One guardian fires directly; several defer
// to the picker; none/no-month leave the resolution blocked for the menu to disable.
// Keeps the component render-only.
export function useFactureGroupeeRowAction(
  student: StudentView | undefined,
  month: string,
): FactureGroupeeRowActionState {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const { print, exportPdf } = useParentStatementActions();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const resolution = resolveFactureGroupee(student?.guardianIds ?? [], month);
  const isPending = print.isPending || exportPdf.isPending;

  const runPrint = async (parentId: string) => {
    try {
      await print.mutateAsync({ parentId, month, locale });
    } catch {
      toast.error(t('invoices.factureGroupee.printError'));
    }
  };

  const runExport = async (parentId: string) => {
    try {
      const { savedPath } = await exportPdf.mutateAsync({ parentId, month, locale });
      if (savedPath !== null) toast.success(t('invoices.factureGroupee.exportSuccess'));
    } catch {
      toast.error(t('invoices.factureGroupee.exportError'));
    }
  };

  const fire = (action: PendingAction, parentId: string) => {
    if (action === 'print') void runPrint(parentId);
    else void runExport(parentId);
  };

  const trigger = (action: PendingAction) => {
    if (resolution.kind === 'single') fire(action, resolution.parentId);
    else if (resolution.kind === 'multiple') setPendingAction(action);
  };

  const pick = (parentId: string) => {
    const action = pendingAction;
    setPendingAction(null);
    if (action !== null) fire(action, parentId);
  };

  return {
    resolution,
    isPending,
    pendingAction,
    trigger,
    pick,
    closePicker: () => setPendingAction(null),
  };
}

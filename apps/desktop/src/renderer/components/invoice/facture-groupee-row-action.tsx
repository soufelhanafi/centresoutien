import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Printer, Download } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useParentStatementActions } from '../../hooks/parent/use-parent-statement-actions';
import { resolveFactureGroupee } from '../../lib/invoices/facture-groupee';
import { GuardianPickerDialog } from './guardian-picker-dialog';

type PendingAction = 'print' | 'export';

/**
 * Per-row "Facture groupée" trigger (SOU-284): resolves the row student's
 * guardians, then prints or exports a single consolidated PDF over all that
 * guardian's children for the screen's active `month`. One guardian fires
 * directly; several open the {@link GuardianPickerDialog}; none/no-month disable
 * the action with a hint. Data access stays behind the IPC gateway.
 */
export function FactureGroupeeRowAction({
  student,
  month,
}: {
  student: StudentView | undefined;
  month: string;
}) {
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

  const handlePick = (parentId: string) => {
    const action = pendingAction;
    setPendingAction(null);
    if (action !== null) fire(action, parentId);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={t('invoices.factureGroupee.menu')}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('invoices.factureGroupee.label')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {resolution.kind === 'blocked' ? (
            <DropdownMenuItem disabled>
              {resolution.reason === 'no-month'
                ? t('invoices.factureGroupee.hint.noMonth')
                : t('invoices.factureGroupee.hint.noGuardian')}
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem disabled={isPending} onSelect={() => trigger('print')}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                {t('invoices.factureGroupee.print')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isPending} onSelect={() => trigger('export')}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {t('invoices.factureGroupee.export')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {resolution.kind === 'multiple' && (
        <GuardianPickerDialog
          guardianIds={resolution.guardianIds}
          open={pendingAction !== null}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
          onPick={handlePick}
        />
      )}
    </>
  );
}

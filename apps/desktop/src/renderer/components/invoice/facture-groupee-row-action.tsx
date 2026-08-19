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
} from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useFactureGroupeeRowAction } from '../../hooks/parent/use-facture-groupee-row-action';
import { GuardianPickerDialog } from './guardian-picker-dialog';

// Per-row "Facture groupée" trigger (SOU-284): prints or exports a single
// consolidated PDF over all a guardian's children for the screen's active month.
// All orchestration (guardian resolution, print/export, the picker) lives in
// useFactureGroupeeRowAction; this component is render-only.
export function FactureGroupeeRowAction({
  student,
  month,
}: {
  student: StudentView | undefined;
  month: string;
}) {
  const { t } = useTranslation();
  const { resolution, isPending, pendingAction, trigger, pick, closePicker } =
    useFactureGroupeeRowAction(student, month);

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
          isOpen={pendingAction !== null}
          onOpenChange={(isOpen) => {
            if (!isOpen) closePicker();
          }}
          onPick={pick}
        />
      )}
    </>
  );
}

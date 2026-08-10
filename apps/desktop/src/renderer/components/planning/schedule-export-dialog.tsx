import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileOutput, Printer } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Skeleton,
} from '@centresoutien/ui';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { useScheduleExportDialog } from '../../hooks/planning/use-schedule-export-dialog';
import { ScheduleExportViewFields } from './schedule-export-view-fields';

/**
 * Weekly schedule PDF export/print trigger (SOU-107): pick a view (full grid,
 * or by room/teacher/group), then print or save the PDF — mirrors the invoice
 * detail's print/export pair (`InvoiceDetailActions`). Owns its own trigger +
 * open state, like `EntityCombobox`, so the planner page stays unchanged
 * besides rendering this one component. No week picker: the exported grid is
 * the weekly recurring template, not a dated week instance.
 */
export function ScheduleExportDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = useSessionFormOptions();
  const dialog = useScheduleExportDialog(options.data);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileOutput className="h-4 w-4" aria-hidden="true" />
          {t('planning.export.trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('planning.export.title')}</DialogTitle>
          <DialogDescription>{t('planning.export.description')}</DialogDescription>
        </DialogHeader>

        {options.data ? (
          <ScheduleExportViewFields
            scope={dialog.scope}
            entityId={dialog.entityId}
            options={options.data}
            onScopeChange={dialog.onScopeChange}
            onEntityIdChange={dialog.onEntityIdChange}
          />
        ) : (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('planning.export.cancel')}
          </Button>
          <Button type="button" variant="outline" disabled={!dialog.canSubmit || dialog.isPending} onClick={dialog.onPrint}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t('planning.export.print')}
          </Button>
          <Button type="button" disabled={!dialog.canSubmit || dialog.isPending} onClick={dialog.onExport}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t('planning.export.export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

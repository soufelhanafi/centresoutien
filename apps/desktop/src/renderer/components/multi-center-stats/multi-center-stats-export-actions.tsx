import { useTranslation } from 'react-i18next';
import { Printer, Download } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { usePrintMultiCenterStats } from '../../hooks/multi-center-stats/use-print-multi-center-stats';
import { useExportMultiCenterStats } from '../../hooks/multi-center-stats/use-export-multi-center-stats';

/** Print (open PDF in the OS viewer) + export (save to a picked path) actions, in the active locale. */
export function MultiCenterStatsExportActions() {
  const { t, i18n } = useTranslation();
  const print = usePrintMultiCenterStats();
  const exportPdf = useExportMultiCenterStats();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  const onPrint = async () => {
    try {
      await print.mutateAsync(locale);
    } catch {
      toast.error(t('multiCenterStats.actions.printError'));
    }
  };

  const onExport = async () => {
    try {
      const savedPath = await exportPdf.mutateAsync(locale);
      if (savedPath !== null) toast.success(t('multiCenterStats.actions.exportSuccess'));
    } catch {
      toast.error(t('multiCenterStats.actions.exportError'));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={onPrint} disabled={print.isPending}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        {t('multiCenterStats.actions.print')}
      </Button>
      <Button variant="outline" onClick={onExport} disabled={exportPdf.isPending}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {t('multiCenterStats.actions.export')}
      </Button>
    </div>
  );
}

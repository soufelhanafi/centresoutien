import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { usePrintSchedule } from './use-print-schedule';
import { useExportSchedule } from './use-export-schedule';
import type { ScheduleExportRequest } from '../../lib/planning/schedule-export';

/** Print/export mutations for the schedule export dialog, sharing one pending
 *  flag and one success/error toast pair (SOU-107). */
export function useScheduleExportActions(buildRequest: () => ScheduleExportRequest) {
  const { t } = useTranslation();
  const print = usePrintSchedule();
  const exportPdf = useExportSchedule();

  const onPrint = async () => {
    try {
      await print.mutateAsync(buildRequest());
      toast.success(t('planning.export.printSuccess'));
    } catch {
      toast.error(t('planning.export.printError'));
    }
  };

  const onExport = async () => {
    try {
      const { savedPath } = await exportPdf.mutateAsync(buildRequest());
      if (savedPath !== null) toast.success(t('planning.export.exportSuccess'));
    } catch {
      toast.error(t('planning.export.exportError'));
    }
  };

  return { isPending: print.isPending || exportPdf.isPending, onPrint, onExport };
}

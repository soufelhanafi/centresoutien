import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useTodayIsoDate } from '../../hooks/use-today-iso-date';
// merge seam (SOU-300): these hooks are owned by the backend worktree and resolve after integration.
import { useDayCloseReport } from '../../hooks/day-close/use-day-close-report';
import { useExportDayClose } from '../../hooks/day-close/use-export-day-close';
import { usePrintDayClose } from '../../hooks/day-close/use-print-day-close';
import { DayCloseSection } from './day-close-section';

/** Wires the day-close queries/mutations to the presentational `DayCloseSection`. */
export function DayCloseContainer() {
  const { t } = useTranslation();
  const today = useTodayIsoDate();
  const [day, setDay] = useState(today);

  const report = useDayCloseReport(day);
  const exportReport = useExportDayClose();
  const printReport = usePrintDayClose();

  const onExport = async () => {
    try {
      await exportReport.mutateAsync({ day });
      toast.success(t('payments.dayClose.exportSuccess'));
    } catch {
      toast.error(t('payments.dayClose.exportError'));
    }
  };

  const onPrint = async () => {
    try {
      await printReport.mutateAsync({ day });
    } catch {
      toast.error(t('payments.dayClose.printError'));
    }
  };

  return (
    <DayCloseSection
      date={{ day, maxDay: today, onChange: setDay }}
      report={report.data}
      isLoading={report.isLoading}
      isError={report.isError}
      onRetry={() => void report.refetch()}
      actions={{
        onExport: () => void onExport(),
        onPrint: () => void onPrint(),
        isExporting: exportReport.isPending,
        isPrinting: printReport.isPending,
      }}
    />
  );
}

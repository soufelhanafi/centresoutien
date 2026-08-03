import { useTranslation } from 'react-i18next';
import { useScheduleExportSelection, viewFilterOf } from './use-schedule-export-selection';
import { useScheduleExportActions } from './use-schedule-export-actions';
import type { ScheduleExportRequest } from '../../lib/planning/schedule-export';

/** Composes the schedule export dialog's selection state and print/export
 *  mutations (SOU-107) into the one seam `ScheduleExportDialog` consumes. */
export function useScheduleExportDialog() {
  const { i18n } = useTranslation();
  const selection = useScheduleExportSelection();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  const buildRequest = (): ScheduleExportRequest => ({
    weekRange: selection.weekRange,
    viewFilter: viewFilterOf(selection.viewKind, selection.entityId),
    locale,
  });

  const actions = useScheduleExportActions(buildRequest);

  return { ...selection, ...actions };
}

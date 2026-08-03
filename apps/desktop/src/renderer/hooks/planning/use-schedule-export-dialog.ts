import { useTranslation } from 'react-i18next';
import { useScheduleExportSelection } from './use-schedule-export-selection';
import { useScheduleExportActions } from './use-schedule-export-actions';
import { scheduleViewFilterOf } from '../../lib/planning/schedule-export-options';
import type { SessionFormOptions } from '../../lib/planning/session-options';
import type { ScheduleExportRequest } from '../../lib/planning/schedule-export';

/** Composes the schedule export dialog's selection state and print/export
 *  mutations (SOU-107) into the one seam `ScheduleExportDialog` consumes.
 *  `options` denormalizes the picked entity's display name(s) into the request
 *  (`scheduleViewFilterOf`); while it is still loading, `'full'` is the only
 *  reachable scope, so the request never needs a lookup. */
export function useScheduleExportDialog(options: SessionFormOptions | undefined) {
  const { i18n } = useTranslation();
  const selection = useScheduleExportSelection();
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  const buildRequest = (): ScheduleExportRequest => ({
    view: options ? scheduleViewFilterOf(selection.scope, selection.entityId, options) : { scope: 'full' },
    locale,
  });

  const actions = useScheduleExportActions(buildRequest);

  return { ...selection, ...actions };
}

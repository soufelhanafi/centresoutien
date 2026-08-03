import { useState } from 'react';
import type { ScheduleViewScope } from '../../lib/planning/schedule-export-options';

/** The picked scope (full grid / room / teacher / group) and entity id for the
 *  schedule export dialog (SOU-107) — pure selection state, no IPC (see
 *  `use-schedule-export-actions`). There is no week range: the exported grid is
 *  the weekly recurring template, the same one `session.week` already renders,
 *  not a dated week instance. */
export function useScheduleExportSelection() {
  const [scope, setScope] = useState<ScheduleViewScope>('full');
  const [entityId, setEntityId] = useState('');

  const canSubmit = scope === 'full' || entityId !== '';

  const changeScope = (next: ScheduleViewScope) => {
    setScope(next);
    setEntityId('');
  };

  return {
    scope,
    entityId,
    canSubmit,
    onScopeChange: changeScope,
    onEntityIdChange: setEntityId,
  };
}

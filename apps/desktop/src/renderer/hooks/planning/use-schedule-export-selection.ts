import { useMemo, useState } from 'react';
import { weekRangeContaining, shiftWeek, todayIso } from '../../lib/planning/week-range';
import type { ScheduleExportViewFilter } from '../../lib/planning/schedule-export';

export type ScheduleViewKind = ScheduleExportViewFilter['kind'];

/** Maps the picked view kind + entity id to the request's discriminated `viewFilter`. */
export function viewFilterOf(kind: ScheduleViewKind, entityId: string): ScheduleExportViewFilter {
  switch (kind) {
    case 'room':
      return { kind: 'room', roomId: entityId };
    case 'teacher':
      return { kind: 'teacher', teacherId: entityId };
    case 'group':
      return { kind: 'group', groupId: entityId };
    default:
      return { kind: 'full' };
  }
}

/** The view kind, picked entity, and anchor week for the schedule export dialog
 *  (SOU-107) — pure selection state, no IPC (see `use-schedule-export-actions`). */
export function useScheduleExportSelection() {
  const [viewKind, setViewKind] = useState<ScheduleViewKind>('full');
  const [entityId, setEntityId] = useState('');
  const [weekAnchor, setWeekAnchor] = useState(todayIso);

  const weekRange = useMemo(() => weekRangeContaining(weekAnchor), [weekAnchor]);
  const canSubmit = viewKind === 'full' || entityId !== '';

  const changeViewKind = (kind: ScheduleViewKind) => {
    setViewKind(kind);
    setEntityId('');
  };

  return {
    viewKind,
    entityId,
    weekAnchor,
    weekRange,
    canSubmit,
    onViewKindChange: changeViewKind,
    onEntityIdChange: setEntityId,
    onWeekAnchorChange: setWeekAnchor,
    onShiftWeek: (delta: number) => setWeekAnchor((current) => shiftWeek(current, delta)),
  };
}

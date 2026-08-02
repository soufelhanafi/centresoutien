import { forwardRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { RosterEntry } from '../../lib/groups/group-view';
import type { AttendanceStatus } from '../../lib/attendance/attendance-view';
import { localizedName } from '../../lib/groups/localized-name';
import { AttendanceStatusButtons } from './attendance-status-buttons';

type RollCallRowProps = {
  entry: RosterEntry;
  status: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

/** One roster row: name + level, and the four-way status control. Focusable as a
 *  whole (`role="row"`) so the roll-call keyboard shortcuts (P/A/L/E, arrows) work
 *  without tabbing into individual buttons — see `RollCallList`. */
export const RollCallRow = forwardRef<HTMLDivElement, RollCallRowProps>(function RollCallRow(
  { entry, status, onChange, onKeyDown },
  ref,
) {
  const { i18n } = useTranslation();
  return (
    <div
      ref={ref}
      role="row"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex items-center justify-between gap-3 rounded-lg border border-transparent p-2 focus:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">
          {localizedName(entry.studentName, i18n.language)}
        </span>
        <span className="text-xs text-muted-foreground">{entry.level}</span>
      </div>
      <AttendanceStatusButtons value={status} onChange={onChange} />
    </div>
  );
});

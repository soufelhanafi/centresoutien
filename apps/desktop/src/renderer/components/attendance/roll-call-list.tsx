import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Numeric } from '@centresoutien/ui';
import type { RosterEntry } from '../../lib/groups/group-view';
import type { AttendanceStatus } from '../../lib/attendance/attendance-view';
import { RollCallRow } from './roll-call-row';

/** Roll-call keyboard shortcuts (SOU-58 "Done when… under 30 seconds"): P/A/L/E
 *  set the focused row's status, ArrowUp/ArrowDown/Enter move focus — so once
 *  everyone defaults to present, flipping absentees is arrow-down + `A` per
 *  student, no mouse required. */
const KEY_TO_STATUS: Readonly<Record<string, AttendanceStatus>> = {
  p: 'present',
  a: 'absent',
  l: 'late',
  e: 'excused',
};

type RollCallListProps = {
  roster: readonly RosterEntry[];
  statusOf: (studentId: string) => AttendanceStatus;
  onSetStatus: (studentId: string, status: AttendanceStatus) => void;
  onMarkAllPresent: () => void;
  presentCount: number;
};

export function RollCallList({
  roster,
  statusOf,
  onSetStatus,
  onMarkAllPresent,
  presentCount,
}: RollCallListProps) {
  const { t } = useTranslation();
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const focusRow = (index: number) => {
    const clamped = Math.max(0, Math.min(roster.length - 1, index));
    rowRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, studentId: string) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      focusRow(index + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index - 1);
      return;
    }
    const status = KEY_TO_STATUS[event.key.toLowerCase()];
    if (status !== undefined) {
      event.preventDefault();
      onSetStatus(studentId, status);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Numeric className="text-xs text-muted-foreground">
          {t('groups.attendance.summary', { present: presentCount, total: roster.length })}
        </Numeric>
        <Button type="button" size="sm" variant="outline" onClick={onMarkAllPresent}>
          {t('groups.attendance.markAllPresent')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('groups.attendance.shortcutsHint')}</p>
      <div
        role="rowgroup"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
      >
        {roster.map((entry, index) => (
          <RollCallRow
            key={entry.studentId}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
            entry={entry}
            status={statusOf(entry.studentId)}
            onChange={(status) => onSetStatus(entry.studentId, status)}
            onKeyDown={(event) => handleKeyDown(event, index, entry.studentId)}
          />
        ))}
      </div>
    </div>
  );
}

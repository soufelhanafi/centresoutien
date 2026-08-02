import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import { ATTENDANCE_STATUSES } from '@centresoutien/domain';
import type { AttendanceStatus } from '../../lib/attendance/attendance-view';

type AttendanceStatusButtonsProps = {
  value: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
};

/** One row's four-way status control — mirrors the P/A/L/E keyboard shortcuts so
 *  mouse and keyboard drive the exact same state. */
export function AttendanceStatusButtons({ value, onChange }: AttendanceStatusButtonsProps) {
  const { t } = useTranslation();
  return (
    <div role="group" className="flex gap-1">
      {ATTENDANCE_STATUSES.map((status) => (
        <Button
          key={status}
          type="button"
          size="sm"
          variant={value === status ? 'default' : 'outline'}
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          {t(`groups.attendance.status.${status}`)}
        </Button>
      ))}
    </div>
  );
}

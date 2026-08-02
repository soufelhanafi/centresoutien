import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import {
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@centresoutien/ui';
import type { WeeklySlotOption } from '../../lib/attendance/attendance-view';

type RollCallSessionPickerProps = {
  date: string;
  onDateChange: (date: string) => void;
  slotsPending: boolean;
  matches: readonly WeeklySlotOption[];
  pickedSlotId: string | null;
  onPickSlot: (slotId: string) => void;
};

/** Date field + weekly-slot resolution: auto-resolves silently when the group
 *  meets only once on the picked weekday, prompts a choice when it meets more
 *  than once, and explains when it doesn't meet that day at all. */
export function RollCallSessionPicker({
  date,
  onDateChange,
  slotsPending,
  matches,
  pickedSlotId,
  onPickSlot,
}: RollCallSessionPickerProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attendance-date">{t('groups.attendance.dateLabel')}</Label>
        <Input
          id="attendance-date"
          type="date"
          dir="ltr"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </div>

      {slotsPending && <Skeleton className="h-10 w-full" />}

      {!slotsPending && matches.length === 0 && (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
          title={t('groups.attendance.noSlotForDay')}
        />
      )}

      {matches.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label>{t('groups.attendance.slotLabel')}</Label>
          <Select value={pickedSlotId ?? ''} onValueChange={onPickSlot}>
            <SelectTrigger>
              <SelectValue placeholder={t('groups.attendance.slotPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {matches.map((slot) => (
                <SelectItem key={slot.recurringSessionId} value={slot.recurringSessionId}>
                  {`${slot.start} – ${slot.end}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

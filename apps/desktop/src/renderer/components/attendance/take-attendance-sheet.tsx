import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import {
  Button,
  EmptyState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
} from '@centresoutien/ui';
import type { GroupRow } from '../../lib/groups/group-view';
import { useGroupRoster } from '../../hooks/group/use-group-roster';
import { useWeeklySlots } from '../../hooks/attendance/use-weekly-slots';
import { useSubmitRollCall } from '../../hooks/attendance/use-submit-roll-call';
import { rollCallErrorCode } from '../../lib/attendance/roll-call-error';
import { useRollCallStatus } from './use-roll-call-status';
import { RollCallSessionPicker } from './roll-call-session-picker';
import { RollCallList } from './roll-call-list';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** UTC-based, matching `today()` — internally consistent even though neither is
 *  the center's local calendar day at the exact UTC midnight boundary. */
function dayOfWeekFor(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

type TakeAttendanceSheetProps = {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Roll-call flow (SOU-58): pick a date, resolve which of the group's weekly
 *  slots falls on that weekday, mark the roster, submit as one batched
 *  `attendance.record` write. */
export function TakeAttendanceSheet({ group, open, onOpenChange }: TakeAttendanceSheetProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const [pickedSlotId, setPickedSlotId] = useState<string | null>(null);

  const slotsQuery = useWeeklySlots(group.id, open);
  const rosterQuery = useGroupRoster(group.id);
  const submit = useSubmitRollCall();
  const roster = rosterQuery.data ?? [];
  const rollCall = useRollCallStatus(roster);

  useEffect(() => {
    if (open) setDate(today());
  }, [open]);

  useEffect(() => {
    setPickedSlotId(null);
  }, [date]);

  const slots = slotsQuery.data ?? [];
  const matches = slots.filter((slot) => slot.dayOfWeek === dayOfWeekFor(date));
  const resolvedSlotId = matches.length === 1 ? (matches[0]?.recurringSessionId ?? null) : pickedSlotId;
  const canSubmit = resolvedSlotId !== null && rollCall.touchedCount > 0 && !submit.isPending;

  const handleSubmit = async () => {
    if (resolvedSlotId === null) return;
    try {
      await submit.mutateAsync({
        recurringSessionId: resolvedSlotId,
        date,
        records: rollCall.toRecords(),
      });
      toast.success(t('groups.attendance.submitSuccess'));
      onOpenChange(false);
    } catch (error) {
      const code = rollCallErrorCode(error);
      toast.error(code ? t(`errors.${code}`) : t('groups.attendance.submitError'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('groups.attendance.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('groups.attendance.title')}</SheetTitle>
          <SheetDescription>{t('groups.attendance.description')}</SheetDescription>
        </SheetHeader>

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <RollCallSessionPicker
            date={date}
            onDateChange={setDate}
            slotsPending={slotsQuery.isPending}
            matches={matches}
            pickedSlotId={pickedSlotId}
            onPickSlot={setPickedSlotId}
          />

          {resolvedSlotId !== null && rosterQuery.isPending && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {resolvedSlotId !== null && rosterQuery.isError && (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title={t('groups.attendance.loadError')}
            />
          )}

          {resolvedSlotId !== null && rosterQuery.isSuccess && roster.length === 0 && (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title={t('groups.attendance.empty.title')}
              description={t('groups.attendance.empty.body')}
            />
          )}

          {resolvedSlotId !== null && roster.length > 0 && (
            <RollCallList
              roster={roster}
              statusOf={rollCall.statusOf}
              onSetStatus={rollCall.setStatus}
              onMarkAllPresent={rollCall.markAllPresent}
              presentCount={rollCall.presentCount}
            />
          )}
        </div>

        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('groups.attendance.cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {submit.isPending ? t('groups.attendance.saving') : t('groups.attendance.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

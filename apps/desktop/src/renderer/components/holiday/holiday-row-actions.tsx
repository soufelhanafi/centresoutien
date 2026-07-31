import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, SquarePen, Archive, RotateCcw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@centresoutien/ui';
import type { HolidayStatus, HolidayView } from '../../lib/holidays/holiday-view';
import { useRestoreHoliday } from '../../hooks/holiday/use-restore-holiday';
import { EditHolidayDialog } from './edit-holiday-dialog';
import { ArchiveHolidayDialog } from './archive-holiday-dialog';

/**
 * Per-row actions. Active holidays get an edit/archive menu; archived holidays
 * get a single restore button. The `variant` (never the row's own flag) decides,
 * so each list renders exactly the actions that make sense for it.
 */
export function HolidayRowActions({ holiday, variant }: { holiday: HolidayView; variant: HolidayStatus }) {
  const { t } = useTranslation();
  const restore = useRestoreHoliday();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(holiday.id);
      toast.success(t('holidays.restore.success'));
    } catch {
      toast.error(t('holidays.restore.error'));
    }
  };

  if (variant === 'archived') {
    return (
      <Button variant="outline" size="sm" disabled={restore.isPending} onClick={handleRestore}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('holidays.row.restore')}
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('holidays.row.menu')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            {t('holidays.row.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            {t('holidays.row.archive')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditHolidayDialog holiday={holiday} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveHolidayDialog holiday={holiday} open={archiveOpen} onOpenChange={setArchiveOpen} />
    </>
  );
}

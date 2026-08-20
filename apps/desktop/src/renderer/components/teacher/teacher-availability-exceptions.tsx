import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  toast,
} from '@centresoutien/ui';
import { formatIsoDate } from '../../lib/center-hours-overrides/dates';
import { useArchiveTeacherAvailabilityException } from '../../hooks/teacher-availability/use-archive-teacher-availability-exception';
import { useAvailabilityRecheck } from '../../hooks/teacher-availability/use-availability-recheck';
import { TeacherAvailabilityExceptionDialog } from './teacher-availability-exception-dialog';
import { TeacherAvailabilityRecheckDialog } from './teacher-availability-recheck-dialog';
import type { IpcResponse } from '../../../shared/ipc/contract';

type ExceptionView = IpcResponse<'teacherAvailability.get'>['exceptions'][number];

/**
 * The one-off absences of one teacher (SOU-259): a dated list under the weekly
 * editor with add and archive (soft-delete) actions. The list itself comes with
 * the tab's single availability query, so this section owns no read state. After
 * an absence is added it runs the SOU-287 re-check: a new absence that strands an
 * existing dated occurrence surfaces it in the same non-blocking summary popup
 * the weekly editor uses.
 */
export function TeacherAvailabilityExceptions({
  teacherId,
  exceptions,
}: {
  teacherId: string;
  exceptions: readonly ExceptionView[];
}) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const recheck = useAvailabilityRecheck(teacherId);

  return (
    <section aria-labelledby="teacher-availability-exceptions-title" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3
            id="teacher-availability-exceptions-title"
            className="text-base font-semibold text-foreground"
          >
            {t('teachers.availability.exceptions.title')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('teachers.availability.exceptions.subtitle')}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('teachers.availability.exceptions.new')}
        </Button>
      </header>

      {exceptions.length === 0 ? (
        <EmptyState
          icon={<CalendarOff className="h-5 w-5" aria-hidden="true" />}
          title={t('teachers.availability.exceptions.empty.title')}
          description={t('teachers.availability.exceptions.empty.body')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {exceptions.map((exception) => (
            <ExceptionRow key={exception.id} exception={exception} />
          ))}
        </ul>
      )}

      <TeacherAvailabilityExceptionDialog
        teacherId={teacherId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void recheck.check()}
      />
      <TeacherAvailabilityRecheckDialog
        open={recheck.open}
        onOpenChange={(next) => (next ? undefined : recheck.dismiss())}
        sessions={recheck.sessions}
        occurrences={recheck.occurrences}
      />
    </section>
  );
}

function ExceptionRow({ exception }: { exception: ExceptionView }) {
  const { t, i18n } = useTranslation();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archive = useArchiveTeacherAvailabilityException();
  const period = `${formatIsoDate(exception.dateRange.start, i18n.language)} – ${formatIsoDate(
    exception.dateRange.end,
    i18n.language,
  )}`;

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(exception.id);
      toast.success(t('teachers.availability.exceptions.archive.success'));
      setArchiveOpen(false);
    } catch {
      toast.error(t('teachers.availability.exceptions.archive.error'));
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm">
        <CalendarOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium tabular-nums" dir="ltr">
          {period}
        </span>
        {exception.label !== null ? (
          <span className="text-muted-foreground">{exception.label}</span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => setArchiveOpen(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{t('teachers.availability.exceptions.archive.action')}</span>
      </Button>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('teachers.availability.exceptions.archive.title')}</DialogTitle>
            <DialogDescription>
              {t('teachers.availability.exceptions.archive.body', { period })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setArchiveOpen(false)}>
              {t('teachers.availability.exceptions.archive.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archive.isPending}
              onClick={handleConfirm}
            >
              {t('teachers.availability.exceptions.archive.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

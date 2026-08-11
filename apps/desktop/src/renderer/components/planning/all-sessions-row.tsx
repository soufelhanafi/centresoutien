import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { SessionForm } from './session-form';
import { SessionConflictAlert } from './session-conflict-alert';
import { CancelSessionDialog } from './cancel-session-dialog';
import { useUpdateSession } from '../../hooks/planning/use-update-session';
import { useCancelSession } from '../../hooks/planning/use-cancel-session';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { toFormInput } from '../../lib/planning/session-view-to-form';
import { toSessionInput, type SessionFormValues } from '../../lib/planning/session-form-schema';
import { mapSessionWriteError, type SessionWriteErrorCode } from '../../lib/planning/session-write-error';
import type { PlannerSessionView } from '../../lib/planning/planner-view';

function summaryLabel(session: PlannerSessionView, subjectFallback: string): string {
  const subject = session.subjectName?.fr ?? subjectFallback;
  return `${session.start}–${session.end} · ${subject}`;
}

/**
 * One row of the all-sessions drawer (SOU-178): collapsed shows the template's
 * time/subject and room; expanded renders the same {@link SessionForm} edit flow
 * as the grid's {@link SessionTemplateDialog}, inline instead of in a dialog.
 * Owns the same update/cancel mutations and conflict handling so both entry
 * points into editing a weekly template stay behaviorally identical.
 */
export function AllSessionsRow({ session }: { session: PlannerSessionView }) {
  const { t } = useTranslation();
  const formId = useId();
  const [expanded, setExpanded] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [errorCodes, setErrorCodes] = useState<readonly SessionWriteErrorCode[]>([]);
  const update = useUpdateSession(session.id);
  const cancel = useCancelSession(session.id);
  const options = useSessionFormOptions();

  const handleSubmit = async (values: SessionFormValues) => {
    setErrorCodes([]);
    try {
      await update.mutateAsync(toSessionInput(values));
      toast.success(t('planning.form.editSuccess'));
      setExpanded(false);
    } catch (error) {
      const code = mapSessionWriteError(error);
      if (code) setErrorCodes([code]);
      else toast.error(t('planning.form.error'));
    }
  };

  const handleCancelSession = async () => {
    try {
      await cancel.mutateAsync();
      toast.success(t('planning.cancelSession.success'));
      setConfirmingCancel(false);
    } catch {
      toast.error(t('planning.cancelSession.error'));
    }
  };

  return (
    <li className="rounded-lg border border-border">
      <Button
        type="button"
        variant="ghost"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="truncate">{summaryLabel(session, t('planning.allSessions.noSubject'))}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="truncate">{session.roomName ?? t('planning.allSessions.noRoom')}</span>
          <ChevronDown
            className={expanded ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'}
            aria-hidden="true"
          />
        </span>
      </Button>

      {expanded ? (
        <div className="space-y-4 border-t border-border p-3">
          <SessionConflictAlert codes={errorCodes} />
          {options.data ? (
            <SessionForm
              formId={formId}
              defaultValues={toFormInput(session)}
              options={options.data}
              onSubmit={handleSubmit}
            />
          ) : null}
          <div className="flex items-center justify-between">
            <Button type="button" variant="destructive" onClick={() => setConfirmingCancel(true)}>
              {t('planning.cancelSession.trigger')}
            </Button>
            <Button type="submit" form={formId} disabled={update.isPending || !options.data}>
              {update.isPending ? t('planning.form.saving') : t('planning.form.save')}
            </Button>
          </div>
        </div>
      ) : null}

      <CancelSessionDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        onConfirm={handleCancelSession}
        pending={cancel.isPending}
      />
    </li>
  );
}

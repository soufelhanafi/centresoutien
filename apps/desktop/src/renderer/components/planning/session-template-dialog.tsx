import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useUpdateSession } from '../../hooks/planning/use-update-session';
import { useCancelSession } from '../../hooks/planning/use-cancel-session';
import { useForceableSessionWrite } from '../../hooks/planning/use-forceable-session-write';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { SessionFormDialog } from './session-form-dialog';
import { CancelSessionDialog } from './cancel-session-dialog';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { toFormInput } from '../../lib/planning/session-view-to-form';

type SessionTemplateDialogProps = {
  /** The clicked session, or `null` when the dialog is closed. */
  session: PlannerSessionView | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Edit-session flow opened from a grid block (SOU-131): edits the weekly slot,
 * surfaces scheduling conflicts inline — including the forceable
 * teacher-availability warning the admin may acknowledge to schedule anyway
 * (SOU-283) — and offers a cancel (soft-delete) action behind a confirmation.
 * Owns the mutations; the dialog is presentational.
 */
export function SessionTemplateDialog({ session, onOpenChange }: SessionTemplateDialogProps) {
  const { t } = useTranslation();
  const update = useUpdateSession(session?.id ?? '');
  const cancel = useCancelSession(session?.id ?? '');
  const options = useSessionFormOptions();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const write = useForceableSessionWrite(update, {
    successMessageKey: 'planning.form.editSuccess',
    onSuccess: () => onOpenChange(false),
  });

  // The dialog stays mounted while the planner swaps which session it edits (and
  // between edits, when `session` is null), so clear any stale conflict / cached
  // force input when the edited session changes — otherwise a forced write could
  // apply the previous session's values through the new session's mutation.
  useEffect(() => write.reset(), [session?.id, write.reset]);

  if (session === null) return null;

  const handleCancelSession = async () => {
    try {
      await cancel.mutateAsync();
      toast.success(t('planning.cancelSession.success'));
      setConfirmingCancel(false);
      onOpenChange(false);
    } catch {
      toast.error(t('planning.cancelSession.error'));
    }
  };

  return (
    <>
      <SessionFormDialog
        mode="edit"
        open
        onOpenChange={onOpenChange}
        defaultValues={toFormInput(session)}
        options={options.data}
        submission={{
          pending: write.pending,
          conflict: write.conflict,
          canForce: write.canForce,
          onSubmit: write.submit,
          onForce: write.force,
        }}
        onCancelSession={() => setConfirmingCancel(true)}
      />
      <CancelSessionDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        onConfirm={handleCancelSession}
        pending={cancel.isPending}
      />
    </>
  );
}

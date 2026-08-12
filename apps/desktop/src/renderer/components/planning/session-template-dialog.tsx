import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useUpdateSession } from '../../hooks/planning/use-update-session';
import { useCancelSession } from '../../hooks/planning/use-cancel-session';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { SessionFormDialog } from './session-form-dialog';
import { CancelSessionDialog } from './cancel-session-dialog';
import type { PlannerSessionView } from '../../lib/planning/planner-view';
import { toFormInput } from '../../lib/planning/session-view-to-form';
import {
  toSessionInput,
  type SessionFormValues,
} from '../../lib/planning/session-form-schema';
import {
  mapSessionWriteError,
  type SessionWriteErrorCode,
} from '../../lib/planning/session-write-error';

type SessionTemplateDialogProps = {
  /** The clicked session, or `null` when the dialog is closed. */
  session: PlannerSessionView | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Edit-session flow opened from a grid block (SOU-131): edits the weekly slot,
 * surfaces scheduling conflicts inline, and offers a cancel (soft-delete) action
 * behind a confirmation. Owns the mutations; the dialog is presentational.
 */
export function SessionTemplateDialog({ session, onOpenChange }: SessionTemplateDialogProps) {
  const { t } = useTranslation();
  const update = useUpdateSession(session?.id ?? '');
  const cancel = useCancelSession(session?.id ?? '');
  const options = useSessionFormOptions();
  const [errorCodes, setErrorCodes] = useState<readonly SessionWriteErrorCode[]>([]);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (session === null) return null;

  const handleSubmit = async (values: SessionFormValues) => {
    setErrorCodes([]);
    try {
      await update.mutateAsync(toSessionInput(values));
      toast.success(t('planning.form.editSuccess'));
      onOpenChange(false);
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
        submission={{ pending: update.isPending, errorCodes, onSubmit: handleSubmit }}
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

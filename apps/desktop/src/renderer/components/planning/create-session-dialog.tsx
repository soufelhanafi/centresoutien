import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import { useCreateSession } from '../../hooks/planning/use-create-session';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { SessionFormSheet } from './session-form-sheet';
import {
  EMPTY_SESSION_INPUT,
  toSessionInput,
  type SessionFormValues,
} from '../../lib/planning/session-form-schema';
import {
  mapSessionWriteError,
  type SessionWriteErrorCode,
} from '../../lib/planning/session-write-error';

/** Create-session flow: owns the mutation, surfaces conflicts inline, toasts the rest. */
export function CreateSessionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateSession();
  const options = useSessionFormOptions();
  const [errorCodes, setErrorCodes] = useState<readonly SessionWriteErrorCode[]>([]);

  const close = (next: boolean) => {
    if (!next) setErrorCodes([]);
    onOpenChange(next);
  };

  const handleSubmit = async (values: SessionFormValues) => {
    setErrorCodes([]);
    try {
      await create.mutateAsync(toSessionInput(values));
      toast.success(t('planning.form.createSuccess'));
      close(false);
    } catch (error) {
      const code = mapSessionWriteError(error);
      if (code) setErrorCodes([code]);
      else toast.error(t('planning.form.error'));
    }
  };

  return (
    <SessionFormSheet
      mode="create"
      open={open}
      onOpenChange={close}
      defaultValues={EMPTY_SESSION_INPUT}
      options={options.data}
      submission={{ pending: create.isPending, errorCodes, onSubmit: handleSubmit }}
    />
  );
}

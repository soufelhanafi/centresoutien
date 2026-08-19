import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import {
  toSessionInput,
  type SessionFormValues,
  type SessionInput,
} from '../../lib/planning/session-form-schema';
import {
  classifySessionWriteError,
  type SessionWriteConflict,
} from '../../lib/planning/session-write-error';

/** The subset of a TanStack mutation this hook drives — create or update alike. */
type SessionWriteMutation = {
  mutateAsync: (input: SessionInput) => Promise<unknown>;
  isPending: boolean;
};

type ForceableSessionWriteOptions = {
  /** i18n key toasted on a successful write. */
  readonly successMessageKey: string;
  /** Called after a successful write (close the drawer / collapse the row). */
  readonly onSuccess: () => void;
};

type SessionWriteHandlers = {
  readonly successMessage: string;
  readonly errorMessage: string;
  readonly onSuccess: () => void;
  readonly setConflict: (conflict: SessionWriteConflict | null) => void;
};

/**
 * Runs one create/edit write and routes its outcome: a clean write clears the
 * conflict, toasts success, and calls `onSuccess`; a classifiable clash surfaces as
 * the inline conflict; anything else toasts the generic error.
 */
async function runSessionWrite(
  input: SessionInput,
  mutation: SessionWriteMutation,
  handlers: SessionWriteHandlers,
): Promise<void> {
  try {
    await mutation.mutateAsync(input);
    handlers.setConflict(null);
    toast.success(handlers.successMessage);
    handlers.onSuccess();
  } catch (error) {
    const classified = classifySessionWriteError(error);
    if (classified) handlers.setConflict(classified);
    else toast.error(handlers.errorMessage);
  }
}

/**
 * Drives the create/edit session write with the SOU-283 warn-and-force flow: a
 * clean write closes; a forceable teacher-availability `warning` surfaces inline
 * and, on the admin's acknowledge, re-runs the same slot with
 * `allowScheduleConflict` set; a hard `error` surfaces inline without a force
 * path; anything else toasts generically. `conflict` holds the one raised
 * conflict (one write raises one) so the drawer can render the alert and decide
 * whether to show the force button. Shared by the dialog and the inline row so
 * both entry points behave identically.
 */
export function useForceableSessionWrite(
  mutation: SessionWriteMutation,
  { successMessageKey, onSuccess }: ForceableSessionWriteOptions,
) {
  const { t } = useTranslation();
  const [conflict, setConflict] = useState<SessionWriteConflict | null>(null);
  const lastInput = useRef<SessionInput | null>(null);

  const run = (input: SessionInput) =>
    runSessionWrite(input, mutation, {
      successMessage: t(successMessageKey),
      errorMessage: t('planning.form.error'),
      onSuccess,
      setConflict,
    });

  const submit = (values: SessionFormValues) => {
    const input = toSessionInput(values);
    lastInput.current = input;
    setConflict(null);
    return run(input);
  };

  const force = () => {
    if (lastInput.current === null) return undefined;
    return run({ ...lastInput.current, allowScheduleConflict: true });
  };

  const reset = useCallback(() => {
    setConflict(null);
    lastInput.current = null;
  }, []);
  const canForce = conflict !== null && conflict.severity === 'warning';
  return { conflict, pending: mutation.isPending, canForce, submit, force, reset };
}

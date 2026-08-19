import { useCreateSession } from '../../hooks/planning/use-create-session';
import { useForceableSessionWrite } from '../../hooks/planning/use-forceable-session-write';
import { useSessionFormOptions } from '../../hooks/planning/use-session-form-options';
import { SessionFormDialog } from './session-form-dialog';
import { EMPTY_SESSION_INPUT } from '../../lib/planning/session-form-schema';

/**
 * Create-session flow: owns the mutation, surfaces conflicts inline, and — for a
 * forceable teacher-availability warning (SOU-283) — lets the admin acknowledge to
 * schedule anyway. Anything unrelated toasts generically.
 */
export function CreateSessionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateSession();
  const options = useSessionFormOptions();
  const write = useForceableSessionWrite(create, {
    successMessageKey: 'planning.form.createSuccess',
    onSuccess: () => onOpenChange(false),
  });

  const close = (next: boolean) => {
    if (!next) write.reset();
    onOpenChange(next);
  };

  return (
    <SessionFormDialog
      mode="create"
      open={open}
      onOpenChange={close}
      defaultValues={EMPTY_SESSION_INPUT}
      options={options.data}
      submission={{
        pending: write.pending,
        conflict: write.conflict,
        canForce: write.canForce,
        onSubmit: write.submit,
        onForce: write.force,
      }}
    />
  );
}

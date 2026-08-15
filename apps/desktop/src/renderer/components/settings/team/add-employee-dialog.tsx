import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateUserInput } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import { useCreateUser } from '../../../hooks/user/use-create-user';
import { mapCreateUserError } from '../../../lib/users/create-user-error';
import type { CreateUserResult } from '../../../lib/users/users-gateway';
import { AddEmployeeForm, type EmployeeFormServerFieldError } from './add-employee-form';

/**
 * Invite-employee flow (SOU-256): owns the mutation and hands the created account
 * plus its one-time setup code back to the parent, which reveals the code dialog.
 * A `username-already-taken` rejection surfaces inline on the username field; the
 * role codes are defensive (the picker only offers invitable roles) and fall back
 * to a toast. Mirrors `CreateSubjectDialog`.
 */
export function AddEmployeeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateUserResult) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateUser();
  const [serverFieldError, setServerFieldError] = useState<EmployeeFormServerFieldError | null>(null);

  useEffect(() => {
    if (open) setServerFieldError(null);
  }, [open]);

  const handleSubmit = async (values: CreateUserInput) => {
    try {
      const result = await create.mutateAsync(values);
      onCreated(result);
      onOpenChange(false);
    } catch (error) {
      const code = mapCreateUserError(error);
      if (code === 'username-already-taken') {
        setServerFieldError({ field: 'username', code });
        return;
      }
      setServerFieldError(null);
      toast.error(t(code ? `errors.${code}` : 'team.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('team.form.title')}</DialogTitle>
          <DialogDescription>{t('team.form.description')}</DialogDescription>
        </DialogHeader>
        <AddEmployeeForm formId={formId} onSubmit={handleSubmit} serverFieldError={serverFieldError} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('team.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending ? t('team.form.saving') : t('team.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

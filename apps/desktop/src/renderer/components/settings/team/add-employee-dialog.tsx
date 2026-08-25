import { useId } from 'react';
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
import { AddEmployeeForm } from './add-employee-form';

/**
 * Invite-employee flow (SOU-303, code-first): owns the mutation and hands the
 * created account plus its one-time setup code back to the parent, which reveals
 * the code dialog. The director picks a role only — there is no identity to reject
 * inline — so a rejection (defensive role codes / auth guards) falls back to a
 * toast. Mirrors `CreateSubjectDialog`.
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

  const handleSubmit = async (values: CreateUserInput) => {
    try {
      const result = await create.mutateAsync(values);
      onCreated(result);
      onOpenChange(false);
    } catch (error) {
      const code = mapCreateUserError(error);
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
        <AddEmployeeForm formId={formId} onSubmit={handleSubmit} />
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

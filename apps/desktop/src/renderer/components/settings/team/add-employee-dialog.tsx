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
import { AddEmployeeForm } from './add-employee-form';

/**
 * Add-employee flow (single-laptop model): owns the mutation. The director sets the
 * new user's login username + password directly, so the account is created active
 * and there is no code to reveal — success is a toast and the roster refreshes. A
 * rejection (a taken username, the defensive role/auth guards) falls back to a
 * toast keyed by the domain error code. Mirrors `CreateSubjectDialog`.
 */
export function AddEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateUser();

  const handleSubmit = async (values: CreateUserInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('team.form.created'));
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

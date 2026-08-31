import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERMISSION_FLAGS, type PermissionFlag } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  toast,
} from '@centresoutien/ui';
import { useUpdateUserPermissions } from '../../../hooks/user/use-update-user-permissions';
import type { UserView } from '../../../lib/users/user-view';

/**
 * Owner-only per-employee screen switches (assistant-visibility): payments,
 * payroll, and the sensitive-settings bundle (team/plan/license/backup), each a
 * toggle the owner may uncheck for this one account. Saves the whole set at
 * once — there is no per-switch autosave — mirroring `AddEmployeeDialog`'s
 * form-then-submit shape rather than `SetupCodeDialog`'s one-time reveal.
 */
export function PermissionsDialog({ user, onClose }: { user: UserView; onClose: () => void }) {
  const { t } = useTranslation();
  const [granted, setGranted] = useState<ReadonlySet<PermissionFlag>>(new Set(user.permissions));
  const updatePermissions = useUpdateUserPermissions();

  const toggle = (flag: PermissionFlag, checked: boolean) => {
    setGranted((current) => {
      const next = new Set(current);
      if (checked) next.add(flag);
      else next.delete(flag);
      return next;
    });
  };

  const save = async () => {
    try {
      await updatePermissions.mutateAsync({ userId: user.id, permissions: [...granted] });
      onClose();
    } catch {
      toast.error(t('team.permissions.error'));
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('team.permissions.title')}</DialogTitle>
          <DialogDescription>
            {t('team.permissions.description', { name: user.username ?? user.fullName ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {PERMISSION_FLAGS.map((flag) => (
            <label
              key={flag}
              htmlFor={`permission-${flag}`}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {t(`team.permissions.flags.${flag}.label`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`team.permissions.flags.${flag}.description`)}
                </span>
              </span>
              <Switch
                id={`permission-${flag}`}
                checked={granted.has(flag)}
                onCheckedChange={(checked) => toggle(flag, checked)}
              />
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={updatePermissions.isPending}>
            {t('team.permissions.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={updatePermissions.isPending}>
            {updatePermissions.isPending ? t('team.permissions.saving') : t('team.permissions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

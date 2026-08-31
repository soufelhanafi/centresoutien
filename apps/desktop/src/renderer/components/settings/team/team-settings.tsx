import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@centresoutien/ui';
import { useUsers } from '../../../hooks/user/use-users';
import { useReissueSetupCode } from '../../../hooks/user/use-reissue-setup-code';
import type { ReissueResult } from '../../../lib/users/users-gateway';
import type { UserView } from '../../../lib/users/user-view';
import { UserListContent, type UserListStatus } from './user-list-content';
import { AddEmployeeDialog } from './add-employee-dialog';
import { SetupCodeDialog } from './setup-code-dialog';
import { PermissionsDialog } from './permissions-dialog';

/**
 * Team / Users section of the Settings page (SOU-256). Lists the center's
 * accounts, invites an employee, and reveals the returned one-time setup code
 * exactly once. "Empty" is measured by invited employees, not total users — the
 * owner is always present, so the empty state nudges the director to add their
 * first employee while a populated roster shows everyone including the owner.
 */
export function TeamSettings() {
  const { t } = useTranslation();
  const users = useUsers();
  const reissue = useReissueSetupCode();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<ReissueResult | null>(null);
  const [managingPermissionsFor, setManagingPermissionsFor] = useState<UserView | null>(null);

  const roster = users.data ?? [];
  const hasEmployees = roster.some((user) => user.role !== 'owner');
  const status = resolveStatus({
    hasData: users.data !== undefined,
    isPending: users.isPending,
    isError: users.isError,
    hasEmployees,
  });

  const handleReissue = async (user: UserView) => {
    try {
      setIssuedCode(await reissue.mutateAsync(user.id));
    } catch {
      toast.error(t('team.reissue.error'));
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t('team.title')}</CardTitle>
          <CardDescription>{t('team.subtitle')}</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {t('team.invite')}
        </Button>
      </CardHeader>
      <CardContent>
        <UserListContent
          status={status}
          users={roster}
          onRetry={() => void users.refetch()}
          onInvite={() => setInviteOpen(true)}
          onReissue={(user) => void handleReissue(user)}
          reissuingId={reissue.isPending ? (reissue.variables ?? null) : null}
          onManagePermissions={setManagingPermissionsFor}
        />
      </CardContent>

      <AddEmployeeDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {issuedCode ? (
        <SetupCodeDialog
          role={issuedCode.user.role}
          setupCode={issuedCode.setupCode}
          onClose={() => setIssuedCode(null)}
        />
      ) : null}

      {managingPermissionsFor ? (
        <PermissionsDialog
          user={managingPermissionsFor}
          onClose={() => setManagingPermissionsFor(null)}
        />
      ) : null}
    </Card>
  );
}

function resolveStatus({
  hasData,
  isPending,
  isError,
  hasEmployees,
}: {
  hasData: boolean;
  isPending: boolean;
  isError: boolean;
  hasEmployees: boolean;
}): UserListStatus {
  // A roster we already have is shown even while a background refetch is failing:
  // a transient user.list error (e.g. the first refetch after a re-login) must
  // never blank a working team list into a full-page error — with retry:false a
  // single blip would otherwise strand the ErrorState until a manual retry.
  if (hasData) return hasEmployees ? 'ready' : 'empty';
  if (isPending) return 'loading';
  if (isError) return 'error';
  return 'empty';
}

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
} from '@centresoutien/ui';
import { useUsers } from '../../../hooks/user/use-users';
import type { CreateUserResult } from '../../../lib/users/users-gateway';
import { UserListContent, type UserListStatus } from './user-list-content';
import { AddEmployeeDialog } from './add-employee-dialog';
import { SetupCodeDialog } from './setup-code-dialog';

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<CreateUserResult | null>(null);

  const roster = users.data ?? [];
  const hasEmployees = roster.some((user) => user.role !== 'owner');
  const status = resolveStatus({ isPending: users.isPending, isError: users.isError, hasEmployees });

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
        />
      </CardContent>

      <AddEmployeeDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={setIssuedCode} />

      {issuedCode ? (
        <SetupCodeDialog
          username={issuedCode.user.username}
          setupCode={issuedCode.setupCode}
          onClose={() => setIssuedCode(null)}
        />
      ) : null}
    </Card>
  );
}

function resolveStatus({
  isPending,
  isError,
  hasEmployees,
}: {
  isPending: boolean;
  isError: boolean;
  hasEmployees: boolean;
}): UserListStatus {
  if (isPending) return 'loading';
  if (isError) return 'error';
  return hasEmployees ? 'ready' : 'empty';
}

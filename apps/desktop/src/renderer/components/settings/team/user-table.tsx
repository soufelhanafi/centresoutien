import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { isInvitableRole } from '@centresoutien/domain';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@centresoutien/ui';
import type { UserView } from '../../../lib/users/user-view';
import { sortUsersForRoster } from '../../../lib/users/sort-users';

/**
 * The team roster (SOU-303): the staff's full name with their username beneath,
 * a translated role, and a login-readiness badge — active, a pending invite (code
 * still redeemable), or an expired invite (code lapsed, account still has no
 * password and cannot log in). A not-yet-onboarded invite has no name/username
 * yet, so it reads as "awaiting activation". The owner carries a distinct role
 * badge. Sorting is renderer-side (owner → active → invites).
 */
export function UserTable({
  users,
  onReissue,
  reissuingId,
}: {
  users: readonly UserView[];
  onReissue: (user: UserView) => void;
  reissuingId: string | null;
}) {
  const { t } = useTranslation();
  const rows = sortUsersForRoster(users);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('team.table.name')}</TableHead>
            <TableHead>{t('team.table.role')}</TableHead>
            <TableHead>{t('team.table.status')}</TableHead>
            <TableHead>
              <span className="sr-only">{t('team.table.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                {(user.fullName ?? user.username) !== null ? (
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {user.fullName ?? user.username}
                    </span>
                    {user.fullName && user.username ? (
                      <span dir="ltr" className="text-xs text-muted-foreground">
                        @{user.username}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm italic text-muted-foreground">
                    {t('team.table.pendingName')}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={user.role === 'owner' ? 'info' : 'neutral'} shape="rounded">
                  {t(`team.roles.${user.role}`)}
                </Badge>
              </TableCell>
              <TableCell>
                {user.status === 'active' ? (
                  <span className="text-sm text-muted-foreground">{t('team.status.active')}</span>
                ) : user.status === 'setup-expired' ? (
                  <Badge variant="destructive" dot>
                    {t('team.status.setupExpired')}
                  </Badge>
                ) : (
                  <Badge variant="warning" dot>
                    {t('team.status.setupPending')}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-end">
                {/* Only roles the domain will actually re-issue a code for (secretary)
                    get the action — otherwise the button would deterministically fail
                    with RoleNotInvitableError. Owner recovers via their own email. */}
                {isInvitableRole(user.role) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onReissue(user)}
                    disabled={reissuingId === user.id}
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    {t('team.reissue.action')}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

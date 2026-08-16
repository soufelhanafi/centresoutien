import { useTranslation } from 'react-i18next';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@centresoutien/ui';
import type { UserView } from '../../../lib/users/user-view';
import { sortUsersForRoster } from '../../../lib/users/sort-users';

/**
 * The team roster (SOU-256): username, translated role, and a login-readiness
 * badge — active, a pending invite (code still redeemable), or an expired invite
 * (code lapsed, account still has no password and cannot log in). The owner — the
 * single first-run account — carries a distinct role badge so it reads apart from
 * the employees it manages. Sorting is renderer-side (owner → active → invites).
 */
export function UserTable({ users }: { users: readonly UserView[] }) {
  const { t } = useTranslation();
  const rows = sortUsersForRoster(users);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('team.table.username')}</TableHead>
            <TableHead>{t('team.table.role')}</TableHead>
            <TableHead>{t('team.table.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium text-foreground">{user.username}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

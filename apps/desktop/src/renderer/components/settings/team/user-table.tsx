import { useTranslation } from 'react-i18next';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@centresoutien/ui';
import type { UserView } from '../../../lib/users/user-view';
import { sortUsersForRoster } from '../../../lib/users/sort-users';

/**
 * The team roster (SOU-256): username, translated role, and a "setup pending"
 * badge for invites whose code has not been redeemed yet. The owner — the single
 * first-run account — carries a distinct role badge so it reads apart from the
 * employees it manages. Sorting is renderer-side (owner → active → pending).
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
                {user.setupPending ? (
                  <Badge variant="warning" dot>
                    {t('team.status.setupPending')}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('team.status.active')}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

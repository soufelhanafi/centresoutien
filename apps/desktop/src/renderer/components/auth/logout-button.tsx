import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import { useLogout } from '../../hooks/auth/use-logout';

/**
 * Signs the device out (SOU-27), returning to the login screen. Its own component
 * so it stays inside the app's `QueryClientProvider` — the mutation touches the
 * query cache, which the top-level `App` body is not wrapped by.
 */
export function LogoutButton() {
  const { t } = useTranslation();
  const logout = useLogout();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
    >
      {t('auth.logout')}
    </Button>
  );
}

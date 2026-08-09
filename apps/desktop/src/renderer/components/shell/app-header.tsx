import { useTranslation } from 'react-i18next';
import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LogoutButton } from '../auth/logout-button';
import { SearchTrigger } from '../search/search-trigger';
import { CenterSwitcher } from './center-switcher';

/**
 * Top bar: the active center on the leading side, session controls on the
 * trailing side. The leading slot holds the {@link CenterSwitcher} (SOU-96):
 * a Premium multi-center dropdown, or — for a single-center / non-Premium
 * install — the plain persisted center-name label, identical to today (SOU-113).
 */
export function AppHeader() {
  const { t } = useTranslation();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 print:hidden">
      <div className="flex min-w-0 items-center gap-2" data-slot="center-switcher">
        <CenterSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SearchTrigger />
        <LanguageToggle />
        <Avatar className="h-8 w-8">
          <AvatarFallback aria-label={t('shell.account')}>
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <LogoutButton />
      </div>
    </header>
  );
}

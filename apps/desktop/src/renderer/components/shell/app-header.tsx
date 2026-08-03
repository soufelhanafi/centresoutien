import { useTranslation } from 'react-i18next';
import { Building2, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LogoutButton } from '../auth/logout-button';
import { SearchTrigger } from '../search/search-trigger';
import { useCenterProfile } from '../../hooks/center/use-center-profile';

/**
 * Top bar: the active center on the leading side, session controls on the
 * trailing side. The center-switcher (SOU-96, Premium) lands in the leading
 * slot later — we reserve the space and show the real persisted center name
 * now (SOU-113). Falls back to a localized placeholder while loading and when
 * no center row exists yet.
 */
export function AppHeader() {
  const { t } = useTranslation();
  const { data } = useCenterProfile();
  const centerName = data?.center?.name ?? t('shell.currentCenter');

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 print:hidden">
      {/* Center-switcher slot — reserved for SOU-96. Persisted center name until then. */}
      <div className="flex min-w-0 items-center gap-2" data-slot="center-switcher">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-sm font-semibold text-foreground">
          {centerName}
        </span>
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

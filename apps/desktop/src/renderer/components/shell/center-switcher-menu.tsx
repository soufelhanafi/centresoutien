import { useTranslation } from 'react-i18next';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@centresoutien/ui';
import type { CenterListItemView, CurrentCenterView } from '../../lib/center/center-gateway';

type CenterSwitcherMenuProps = {
  centers: readonly CenterListItemView[];
  current: CurrentCenterView;
  isSwitching: boolean;
  onSwitch: (centreId: string) => void;
};

/**
 * The header dropdown that lists local centers and switches between them
 * (SOU-96, Premium). The current center is checked and non-selectable; picking
 * another fires the switch. `ChevronsUpDown` is vertical, so it needs no RTL
 * mirroring; alignment uses `align="start"` (Radix resolves it against `dir`).
 */
export function CenterSwitcherMenu({ centers, current, isSwitching, onSwitch }: CenterSwitcherMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 gap-2 px-2"
          disabled={isSwitching}
          aria-label={t('centerSwitcher.trigger', { name: current.displayName })}
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">{current.displayName}</span>
          {isSwitching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t('centerSwitcher.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {centers.map((center) => {
          const isCurrent = center.centreId === current.centreId;
          return (
            <DropdownMenuItem
              key={center.centreId}
              disabled={isCurrent || isSwitching}
              onSelect={() => onSwitch(center.centreId)}
              className="gap-2"
            >
              <Check
                className={cn('h-4 w-4 shrink-0', isCurrent ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-col text-start">
                <span className="truncate text-sm font-medium text-foreground">{center.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{center.centerCode}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

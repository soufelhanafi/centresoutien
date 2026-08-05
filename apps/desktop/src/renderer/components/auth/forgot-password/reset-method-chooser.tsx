import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, ShieldQuestion } from 'lucide-react';
import { Badge, Button } from '@centresoutien/ui';

export type ResetMethod = 'recovery' | 'security';

/**
 * Picks how to recover access (SOU-156), in order of strength/availability:
 * recovery code (offline, primary), email (only when online — and a disabled
 * placeholder until the SOU-157 relay ships), then security questions as the
 * last resort. The email tile is hidden entirely offline, so an offline center
 * only ever sees the two paths it can actually complete.
 */
export function ResetMethodChooser({
  online,
  onSelect,
}: {
  online: boolean;
  onSelect: (method: ResetMethod) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('auth.forgot.chooser.subtitle')}</p>

      <Button
        type="button"
        variant="outline"
        className="h-auto flex-col items-start gap-1 p-4 text-start"
        onClick={() => onSelect('recovery')}
      >
        <span className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
          {t('auth.forgot.chooser.recovery.title')}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {t('auth.forgot.chooser.recovery.description')}
        </span>
      </Button>

      {online ? (
        <Button
          type="button"
          variant="outline"
          disabled
          className="h-auto flex-col items-start gap-1 p-4 text-start"
        >
          <span className="flex flex-wrap items-center gap-2 font-medium">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            {t('auth.forgot.chooser.email.title')}
            <Badge variant="neutral">{t('auth.forgot.chooser.email.soon')}</Badge>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {t('auth.forgot.chooser.email.description')}
          </span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-auto flex-col items-start gap-1 p-4 text-start"
        onClick={() => onSelect('security')}
      >
        <span className="flex items-center gap-2 font-medium">
          <ShieldQuestion className="h-4 w-4 shrink-0" aria-hidden />
          {t('auth.forgot.chooser.security.title')}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {t('auth.forgot.chooser.security.description')}
        </span>
      </Button>
    </div>
  );
}

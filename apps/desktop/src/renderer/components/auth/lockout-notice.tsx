import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useCountdown } from '../../hooks/auth/use-countdown';

/** Remaining time as `m:ss`, rounding up so the last second is never dropped. */
function formatCooldown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The locked state of the login screen (SOU-27): a banner with a live countdown
 * to the end of the 15-minute cooldown. Fires `onElapsed` once it hits zero so the
 * form re-enables itself. `role="alert"` announces the lock to assistive tech.
 */
export function LockoutNotice({
  untilMs,
  onElapsed,
}: {
  untilMs: number;
  onElapsed: () => void;
}) {
  const { t } = useTranslation();
  const remaining = useCountdown(untilMs);

  useEffect(() => {
    if (remaining === 0) onElapsed();
  }, [remaining, onElapsed]);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('auth.locked.title')}</p>
        <p className="text-sm">{t('auth.locked.body', { time: formatCooldown(remaining) })}</p>
      </div>
    </div>
  );
}

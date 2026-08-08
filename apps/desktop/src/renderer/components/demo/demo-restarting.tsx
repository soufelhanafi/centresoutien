import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

/**
 * The post-`demo.create` / `demo.wipe` state (SOU-110): the main process is
 * about to restart the app into the demo (or back to the real center), so the
 * UI shows a fixed message and issues no further calls.
 */
export function DemoRestarting() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col items-center gap-3 py-8 text-center"
    >
      <Loader2
        className="size-6 animate-spin text-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{t('demo.restarting.title')}</p>
        <p className="text-sm text-muted-foreground">{t('demo.restarting.body')}</p>
      </div>
    </div>
  );
}

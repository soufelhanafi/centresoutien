import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { useDemoStatus } from '../../hooks/demo/use-demo-status';
import { useWipeDemo } from '../../hooks/demo/use-wipe-demo';
import { DemoWipeDialog } from '../demo/demo-wipe-dialog';

/**
 * Persistent "MODE DÉMO" strip in the app chrome (SOU-110): visible only while
 * the open center is the demo center. Carries the one-click wipe so a sales
 * visit never leaves demo artefacts behind. On a confirmed wipe the app
 * restarts, so the strip swaps to the restarting state.
 */
export function DemoBanner() {
  const { t } = useTranslation();
  const { data } = useDemoStatus();
  const wipe = useWipeDemo();
  const [wipeOpen, setWipeOpen] = useState(false);

  if (data?.isDemo !== true) return null;

  return (
    <div
      role="banner"
      className="flex h-10 shrink-0 items-center justify-between gap-3 bg-primary px-4 text-primary-foreground print:hidden"
    >
      {wipe.isSuccess ? (
        <div className="flex items-center gap-2" role="status" aria-busy="true">
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {t('demo.restarting.title')}
          </span>
        </div>
      ) : (
        <>
          <p className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            <span>{t('demo.banner.label')}</span>
            <span className="hidden font-normal normal-case tracking-normal text-primary-foreground/80 sm:inline">
              {t('demo.banner.subtitle')}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={wipe.isPending}
            className="shrink-0 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
            onClick={() => setWipeOpen(true)}
          >
            {t('demo.banner.wipe')}
          </Button>
        </>
      )}
      <DemoWipeDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        pending={wipe.isPending}
        onConfirm={() => {
          setWipeOpen(false);
          wipe.mutate(undefined, { onError: () => toast.error(t('demo.wipeError')) });
        }}
      />
    </div>
  );
}

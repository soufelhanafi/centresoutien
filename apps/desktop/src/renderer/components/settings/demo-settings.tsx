import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@centresoutien/ui';
import { useCreateDemo } from '../../hooks/demo/use-create-demo';
import { useDemoStatus } from '../../hooks/demo/use-demo-status';
import { useWipeDemo } from '../../hooks/demo/use-wipe-demo';
import { DemoWipeDialog } from '../demo/demo-wipe-dialog';

/**
 * "Mode démo" tab of the Settings page (SOU-110) — one of the two entry
 * points (the other is the login screen). NOT in demo: an explainer card plus
 * the create action. IN demo: an info card plus the destructive wipe action.
 * On success the DB hot-swaps in place (SOU-186): the demo status refetches and
 * the card flips to the other variant — no restart, no reload.
 */
export function DemoSettings() {
  const { t } = useTranslation();
  const status = useDemoStatus();
  const create = useCreateDemo();
  const wipe = useWipeDemo();
  const [wipeOpen, setWipeOpen] = useState(false);

  const isDemo = status.data?.isDemo ?? false;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('demo.tab')}</CardTitle>
        <CardDescription>
          {isDemo ? t('demo.active.subtitle') : t('demo.intro.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.isPending ? (
          <div className="flex items-center gap-3 py-4" aria-busy="true">
            <Loader2
              className="size-5 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">{t('demo.error.loading')}</p>
          </div>
        ) : status.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t('demo.error.body')}</p>
            <Button type="button" variant="outline" onClick={() => void status.refetch()}>
              {t('demo.error.retry')}
            </Button>
          </div>
        ) : isDemo ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">{t('demo.active.title')}</p>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setWipeOpen(true)}
              disabled={wipe.isPending || wipe.isSuccess}
            >
              {wipe.isPending || wipe.isSuccess ? t('demo.active.wiping') : t('demo.active.wipe')}
            </Button>
            {wipe.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {t('demo.wipeError')}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <Button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending || create.isSuccess}
            >
              {create.isPending || create.isSuccess
                ? t('demo.intro.creating')
                : t('demo.intro.create')}
            </Button>
            {create.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {t('demo.createError')}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
      <DemoWipeDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        pending={wipe.isPending}
        onConfirm={() => {
          setWipeOpen(false);
          wipe.mutate();
        }}
      />
    </Card>
  );
}

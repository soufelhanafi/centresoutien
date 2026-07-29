import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DirectionProvider,
} from '@centresoutien/ui';
import { useHtmlDirection } from './hooks/use-html-direction';
import { LanguageToggle } from './components/language-toggle';
import { PlanSwitcher } from './components/plan-switcher';
import { FeatureGate } from './components/feature-gate';
import { PlanLock } from './components/plan-lock';
import { SubjectForm } from './components/subject/subject-form';
import { usePlanStore } from './stores/plan-store';
import { queryClient } from './lib/query-client';
import { Showcase } from './showcase/showcase';

// Smoke page: React + Tailwind + shadcn/ui + typed IPC + i18n/RTL + plan gating.
export function App() {
  const { t } = useTranslation();
  const direction = useHtmlDirection();
  const setPlan = usePlanStore((state) => state.setPlan);
  const [ping, setPing] = useState('…');

  useEffect(() => {
    if (!window.api) {
      setPing('IPC unavailable');
      return;
    }
    window.api
      .invoke('app.ping', { message: 'renderer' })
      .then((res) => setPing(`${res.reply} — v${res.appVersion}`))
      .catch((error: unknown) => setPing(`IPC error: ${String(error)}`));
  }, []);

  useEffect(() => {
    window.api
      ?.invoke('plan.get', {})
      .then((res) => setPlan(res.planId))
      .catch(() => undefined);
  }, [setPlan]);

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={direction}>
        <main className="flex min-h-screen flex-col items-start gap-6 bg-background p-8 text-foreground">
          <div className="flex w-full items-center justify-between">
            <h1 className="text-2xl font-semibold text-primary">{t('app.title')}</h1>
            <LanguageToggle />
          </div>

          <p className="text-sm text-muted-foreground">
            {t('smoke.ipcLabel')} : {ping}
          </p>

          <PlanSwitcher />

          <FeatureGate feature="sync.multi-device" fallback={<PlanLock />}>
            <Button variant="secondary">{t('smoke.premiumFeature')}</Button>
          </FeatureGate>

          <SubjectForm />

          <Dialog>
            <DialogTrigger asChild>
              <Button>{t('smoke.openDialog')}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={t('smoke.close')}>
              <DialogHeader>
                <DialogTitle>{t('smoke.dialogTitle')}</DialogTitle>
                <DialogDescription>{t('smoke.dialogBody')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t('smoke.close')}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {import.meta.env.DEV ? <Showcase /> : null}
        </main>
      </DirectionProvider>
    </QueryClientProvider>
  );
}

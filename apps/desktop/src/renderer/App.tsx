import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '@centresoutien/ui';
import { useHtmlDirection } from './hooks/use-html-direction';
import { LanguageToggle } from './components/language-toggle';

// Smoke page (SOU-16/21): React + Tailwind + shadcn/ui + typed IPC + i18n/RTL.
export function App() {
  const { t } = useTranslation();
  useHtmlDirection();
  const [ping, setPing] = useState('…');

  useEffect(() => {
    window.api
      .invoke('app.ping', { message: 'renderer' })
      .then((res) => setPing(`${res.reply} — v${res.appVersion}`))
      .catch((error: unknown) => setPing(`IPC error: ${String(error)}`));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-start gap-6 bg-background p-8 text-foreground">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">{t('app.title')}</h1>
        <LanguageToggle />
      </div>

      <p className="text-sm text-muted-foreground">
        {t('smoke.ipcLabel')} : {ping}
      </p>

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
    </main>
  );
}

import { useEffect, useState } from 'react';
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

// Smoke page (SOU-16): proves React + Tailwind + shadcn/ui + the typed IPC
// bridge all work together. Real screens and i18n arrive in SOU-21+.
export function App() {
  const [ping, setPing] = useState('…');

  useEffect(() => {
    window.api
      .invoke('app.ping', { message: 'renderer' })
      .then((res) => setPing(`${res.reply} — v${res.appVersion}`))
      .catch((error: unknown) => setPing(`IPC error: ${String(error)}`));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-start gap-6 bg-background p-8 text-foreground">
      <h1 className="text-2xl font-semibold text-primary">Centre Soutien</h1>
      <p className="text-sm text-muted-foreground">IPC : {ping}</p>

      <Dialog>
        <DialogTrigger asChild>
          <Button>Ouvrir la fenêtre</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bienvenue</DialogTitle>
            <DialogDescription>
              Fondation React 19 + Tailwind + shadcn/ui prête.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Fermer</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

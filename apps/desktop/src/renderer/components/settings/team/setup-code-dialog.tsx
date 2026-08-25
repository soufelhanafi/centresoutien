import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound } from 'lucide-react';
import type { Role } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@centresoutien/ui';

/**
 * Shows the one-time setup code returned by `user.create` (SOU-303). This is the
 * code's only appearance — no channel can read it again — so the copy affordance
 * and the "shown once" warning are load-bearing, not decorative. Code-first: the
 * director hands the code to the employee, who chooses their own username / full
 * name / email when they redeem it, so the dialog names the role the code grants,
 * not a username. Dismissing the dialog discards the code for good.
 */
export function SetupCodeDialog({
  role,
  setupCode,
  onClose,
}: {
  role: Role;
  setupCode: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(setupCode);
    setCopied(true);
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('team.setupCode.title')}</DialogTitle>
          <DialogDescription>
            {t('team.setupCode.description', { role: t(`team.roles.${role}`) })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"
            aria-hidden="true"
          >
            <KeyRound className="h-5 w-5" />
          </span>
          <code
            dir="ltr"
            className="grow select-all text-lg font-semibold tracking-widest text-foreground"
          >
            {setupCode}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copy}
            aria-label={copied ? t('team.setupCode.copied') : t('team.setupCode.copy')}
          >
            {copied ? (
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <p role="alert" className="text-xs text-muted-foreground">
          {t('team.setupCode.warning')}
        </p>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('team.setupCode.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

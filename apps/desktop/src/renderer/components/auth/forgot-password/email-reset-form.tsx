import { useState } from 'react';
import { EmailResetRequestStep } from './email-reset-request-step';
import { EmailResetConfirmStep } from './email-reset-confirm-step';

/**
 * The two-step email reset path (SOU-273): request a mailed 6-digit code, then
 * confirm it with a new password. A dumb coordinator — each step owns its own
 * IPC call and outcome handling; this only advances `request` → `confirm` and
 * surfaces the final success upward.
 */
export function EmailResetForm({
  onSuccess,
  onBackToChooser,
}: {
  onSuccess: () => void;
  onBackToChooser: () => void;
}) {
  const [step, setStep] = useState<'request' | 'confirm'>('request');

  if (step === 'confirm') {
    return <EmailResetConfirmStep onSuccess={onSuccess} />;
  }

  return <EmailResetRequestStep onSent={() => setStep('confirm')} onBackToChooser={onBackToChooser} />;
}

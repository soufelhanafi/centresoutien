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
  // The username entered at step 1 is carried into step 2 so the confirm call
  // targets the same account (SOU-303).
  const [username, setUsername] = useState<string | null>(null);

  if (username !== null) {
    return <EmailResetConfirmStep username={username} onSuccess={onSuccess} />;
  }

  return <EmailResetRequestStep onSent={setUsername} onBackToChooser={onBackToChooser} />;
}

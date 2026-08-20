import type { SubscriptionInvoiceOutcome } from '@centresoutien/domain';

/**
 * What the director should see after a subscription was created (SOU-289):
 * a translated message (the key resolves under `students.subscription.wizard.
 * invoice.*`), a toast tone, and — when an invoice is ready to open — its id.
 * `null` means the outcome is not user-relevant (plain success feedback only).
 */
export type SubscriptionInvoiceFeedback = {
  tone: 'success' | 'info' | 'warning';
  messageKey: string;
  invoiceId: string | null;
};

const KEY_PREFIX = 'students.subscription.wizard.invoice';

/**
 * Maps the domain's first-invoice outcome to director-facing feedback — pure
 * presentation, no business rules. Internal outcome names never reach the UI;
 * only the translated `messageKey` does. `invoicing-unavailable` is silent by
 * design (unreachable on shipped plans, and not the director's problem).
 */
export function mapSubscriptionInvoiceOutcome(
  outcome: SubscriptionInvoiceOutcome,
  invoiceId: string | null,
): SubscriptionInvoiceFeedback | null {
  switch (outcome) {
    case 'created':
    case 'line-appended':
      return { tone: 'success', messageKey: `${KEY_PREFIX}.ready`, invoiceId };
    case 'already-billed':
      return { tone: 'info', messageKey: `${KEY_PREFIX}.alreadyBilled`, invoiceId: null };
    case 'issued-skipped':
      return { tone: 'warning', messageKey: `${KEY_PREFIX}.issuedSkipped`, invoiceId: null };
    case 'deferred-future-month':
      return { tone: 'info', messageKey: `${KEY_PREFIX}.deferred`, invoiceId: null };
    case 'formula-unresolved':
      return { tone: 'warning', messageKey: `${KEY_PREFIX}.notGenerated`, invoiceId: null };
    case 'generation-failed':
      return { tone: 'warning', messageKey: `${KEY_PREFIX}.generationFailed`, invoiceId: null };
    case 'invoicing-unavailable':
      return null;
  }
}

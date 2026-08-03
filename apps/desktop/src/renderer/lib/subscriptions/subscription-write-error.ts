import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

export type SubscriptionWriteErrorCode =
  | 'too-many-active-subscriptions'
  | 'student-subscription-not-found'
  | 'student-not-found';

const CODES = new Set<string>([
  'too-many-active-subscriptions',
  'student-subscription-not-found',
  'student-not-found',
] satisfies SubscriptionWriteErrorCode[]);

export function mapSubscriptionWriteError(error: unknown): SubscriptionWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as SubscriptionWriteErrorCode) : null;
}

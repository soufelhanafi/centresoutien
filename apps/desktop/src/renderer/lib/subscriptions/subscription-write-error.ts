export type SubscriptionWriteErrorCode =
  | 'too-many-active-subscriptions'
  | 'student-subscription-not-found'
  | 'student-not-found';

const ERROR_NAME_TO_CODE: Readonly<Record<string, SubscriptionWriteErrorCode>> = {
  TooManyActiveSubscriptionsError: 'too-many-active-subscriptions',
  StudentSubscriptionNotFoundError: 'student-subscription-not-found',
  StudentNotFoundError: 'student-not-found',
};

export function mapSubscriptionWriteError(error: unknown): SubscriptionWriteErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  return null;
}

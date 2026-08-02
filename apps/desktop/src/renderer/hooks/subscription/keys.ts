/** Query keys for the subscriptions module. Every write invalidates a student's `list`. */
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  list: (studentId: string) => ['subscriptions', 'list', studentId] as const,
};

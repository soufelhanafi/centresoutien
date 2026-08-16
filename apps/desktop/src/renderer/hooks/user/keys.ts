/**
 * Query keys for the user-management module (SOU-256). Inviting an employee
 * invalidates the `list` key so the team roster refetches and the new
 * setup-pending account appears.
 */
export const userKeys = {
  all: ['users'] as const,
  list: ['users', 'list'] as const,
};

export const syncKeys = {
  conflicts: ['sync', 'conflicts'] as const,
  /** Mutation key for the pull → resolve → push cycle — observed globally via
   *  `useIsMutating` so the app-shell banner knows a sync is running without
   *  the Sync page being mounted. */
  run: ['sync', 'run'] as const,
};

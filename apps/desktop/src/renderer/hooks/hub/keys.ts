/** Query keys for the LAN hub reads (SOU-318). Discovery runs on mount as a query
 *  (not cached across mounts) and re-runs via `refetch`; hosting status is cached. */
export const hubKeys = {
  hostingStatus: ['hub', 'hostingStatus'] as const,
  discover: ['hub', 'discover'] as const,
};

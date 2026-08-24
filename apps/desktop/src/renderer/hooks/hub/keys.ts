/** Query keys for the LAN hub reads (SOU-318). Discovery is a fresh browse each
 *  time and is driven imperatively, so only the hosting status is cached here. */
export const hubKeys = {
  hostingStatus: ['hub', 'hostingStatus'] as const,
};

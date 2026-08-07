/**
 * The renderer-side contract for the demo-mode channels (SOU-110), pinned to
 * the exact shapes the domain-backend agent is registering on `ipcContract`.
 * The UI consumes the {@link DemoGateway} interface — never these channels
 * directly — so swapping the mock for the real IPC adapter is a one-line
 * change with no component edits.
 *
 * The three channels:
 *  - `demo.status` (request `{}`) -> `{ isDemo }` — whether the currently-open
 *    center is the demo center.
 *  - `demo.create` (request `{}`) -> `{ relaunching: true }` — creates + seeds
 *    the demo DB, then the app relaunches into demo mode.
 *  - `demo.wipe`  (request `{}`) -> `{ relaunching: true }` — deletes every
 *    demo artefact and relaunches into the real center.
 */
export const demoChannels = {
  status: 'demo.status',
  create: 'demo.create',
  wipe: 'demo.wipe',
} as const;

/** `demo.status` response — whether the open center is the demo center. */
export type DemoStatusResponse = {
  isDemo: boolean;
};

/** `demo.create` / `demo.wipe` response — the app is about to restart. */
export type DemoMutationResponse = {
  relaunching: true;
};

/**
 * The renderer-side contract for the demo-mode channels (SOU-110), pinned to
 * the exact shapes the domain-backend agent is registering on `ipcContract`.
 * The UI consumes the {@link DemoGateway} interface — never these channels
 * directly — so swapping the mock for the real IPC adapter is a one-line
 * change with no component edits.
 *
 * The three channels (SOU-186 hot-swap — no process restart, no window reload):
 *  - `demo.status` (request `{}`) -> `{ isDemo, demoLogin, isHubHost }` — whether
 *    the currently-open center is the demo center, the demo login prefill, and
 *    whether this device is the LAN hub host (SOU-190).
 *  - `demo.create` (request `{}`) -> `{ isDemo: true }` — creates + seeds the
 *    demo DB, then hot-swaps the open center to it; resolves AFTER the swap.
 *  - `demo.wipe`  (request `{}`) -> `{ isDemo: false }` — swaps back to the real
 *    center, then deletes every demo artefact; resolves AFTER the swap.
 */
export const demoChannels = {
  status: 'demo.status',
  create: 'demo.create',
  wipe: 'demo.wipe',
} as const;

/** The demo admin credentials the login screen prefills with (SOU-186). */
export type DemoLogin = {
  username: string;
  password: string;
};

/**
 * `demo.status` response — whether the open center is the demo center, plus the
 * demo login prefill (SOU-186) and whether this device is the active LAN hub
 * host (SOU-190). `demoLogin` is non-null ONLY when the open center IS the demo
 * center AND main has the `CS_DEMO_*` env vars set; the renderer holds no
 * credential literal of its own and reads them only from here. `isHubHost` is
 * true ONLY on the real center AND when main's embedded hub is serving
 * (`CS_HUB_ENABLED` + `CS_HUB_TOKEN` + `CS_HUB_PORT` + `CS_HUB_BIND_HOST`) —
 * the renderer uses it to warn before `demo.create`, which stops the hub.
 */
export type DemoStatusResponse = {
  isDemo: boolean;
  demoLogin: DemoLogin | null;
  isHubHost: boolean;
};

/**
 * `demo.create` / `demo.wipe` response — the demo hot-swap that just completed
 * (SOU-186). `create` resolves `{ isDemo: true }`, `wipe` resolves
 * `{ isDemo: false }`, always AFTER the in-process DB swap; the renderer reacts
 * off the resolved promise (cache-invalidate + store-reset), never a reload.
 */
export type DemoMutationResponse = {
  isDemo: boolean;
};

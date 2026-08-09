/**
 * The demo center's admin credentials (SOU-186). Read ONLY here, in the main
 * process, so no credential literal ever sits in committed source (neither the
 * data layer's seeder nor the renderer's login prefill hold one). The seeder
 * receives these via injection and the renderer via the `demo.status` IPC response.
 *
 * Two provisioning paths, checked in order:
 *  1. `process.env.CS_DEMO_{USERNAME,PASSWORD}` at runtime — dev shell / a
 *     gitignored `.env`, and the E2E harness (`global-setup.ts`).
 *  2. The build-time constants `__CS_DEMO_{USERNAME,PASSWORD}__` that
 *     electron-vite's `define` injects from the BUILD environment — the only path
 *     a packaged binary has, since the sales laptop carries no shell env. Empty
 *     when the build env was unset, so demo mode stays unavailable (fail loud).
 * Neither path is a source literal; the value comes from the environment at run
 * time or build time.
 */
export type DemoAdminCredentials = { username: string; password: string };

function provisionedUsername(): string {
  return process.env['CS_DEMO_USERNAME'] || __CS_DEMO_USERNAME__;
}

function provisionedPassword(): string {
  return process.env['CS_DEMO_PASSWORD'] || __CS_DEMO_PASSWORD__;
}

/**
 * Resolve the demo admin credentials, failing loud when either environment
 * variable is unset or empty. `demo.create` calls this BEFORE seeding so demo
 * mode is simply unavailable — with a clear error — when the operator has not
 * provisioned the credentials. The rest of the app is unaffected.
 */
export function demoAdminCredentials(): DemoAdminCredentials {
  const username = provisionedUsername();
  const password = provisionedPassword();
  if (!username || !password) {
    throw new Error('Demo mode requires CS_DEMO_USERNAME and CS_DEMO_PASSWORD to be set.');
  }
  return { username, password };
}

/**
 * The lenient variant for the `demo.status` read: returns `null` (never throws)
 * when either variable is unset or empty, so the status channel can report
 * `demoLogin: null` and the app stays usable without demo credentials.
 */
export function demoAdminCredentialsOrNull(): DemoAdminCredentials | null {
  const username = provisionedUsername();
  const password = provisionedPassword();
  if (!username || !password) return null;
  return { username, password };
}

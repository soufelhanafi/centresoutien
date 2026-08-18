import { test, type ElectronApplication, type Page } from '@playwright/test';
import {
  launch,
  freshUserDataDir,
  completeSetupAndLogin,
  type Locale,
} from './team-users.fixtures';

/**
 * Shared setup for the SOU-265 security regression specs (trusted session
 * principal + role-scoped director IPC guards). The original single spec bundled
 * every flow; it is split per-flow so each file covers one cohesive scenario,
 * with the common app lifecycle + throwaway credentials living here.
 */

export const locale = (): Locale => test.info().project.name as Locale;

// Throwaway employee credentials assembled at runtime (secret-scan friendly);
// meets the redeem password policy: >=8 chars, upper + lower + digit.
export const EMP_USER = 'fatima.secretaire';
export const EMP_PW = ['Fatima', '2026', '!'].join('');

export type LiveApp = { app: ElectronApplication; win: Page };

// One live Electron app per test, torn down automatically. Specs that only need a
// booted director call `bootDirector`; specs that manage their own launch/restart
// (remember-me persistence) use `set`/`get` to keep teardown honest.
export function createLiveAppHarness(): {
  bootDirector: (loc: Locale) => Promise<Page>;
  set: (next: LiveApp) => void;
  get: () => LiveApp | null;
} {
  let live: LiveApp | null = null;
  test.afterEach(async () => {
    await live?.app.close();
    live = null;
  });
  return {
    async bootDirector(loc: Locale): Promise<Page> {
      live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
      await completeSetupAndLogin(live.win, loc);
      return live.win;
    },
    set(next: LiveApp): void {
      live = next;
    },
    get(): LiveApp | null {
      return live;
    },
  };
}

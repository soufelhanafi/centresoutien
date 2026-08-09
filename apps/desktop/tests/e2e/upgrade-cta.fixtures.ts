import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-85 — "Upgrade CTAs on gated features".
 *
 * Two things are black-box reachable against the packaged app:
 *
 *  1. The `external.open` IPC channel that the shared UpgradeDialog's
 *     "Voir les tarifs" / "عرض الأسعار" button drives — host-whitelisted to
 *     centresoutien.com. Reachable even before login (restricted mode allows it),
 *     so no admin/seed is needed. We stub `shell.openExternal` in the main
 *     process so the ALLOW branch returns `opened:true` without spawning a real
 *     browser; the allow/reject DECISION (`isAllowedExternalUrl`) runs before the
 *     shell call and is unaffected by the stub.
 *
 *  2. A reachability probe proving the CTA/dialog gated state itself is NOT
 *     drivable here: under the SOU-83 flat MVP tiers every flag except
 *     `org.multi-center` ships in all three tiers, and no desktop surface is
 *     gated on `org.multi-center`, so none of SOU-85's CTA surfaces ever lock.
 *     This is the SOU-187 feature-drop seam gap. See upgrade-cta.spec.ts.
 *
 * No renderer/domain/data implementation is imported.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

export type Launched = { app: ElectronApplication; win: Page };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-upgrade-'));
}

export async function launch(locale: Locale, plan: PlanId): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Replace `shell.openExternal` in the main process with a resolving no-op so an
 * allowed URL exercises the handler's success path (`opened:true`) without
 * actually launching the OS browser during the run.
 */
export async function stubOpenExternal(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openExternal = (async () => undefined) as never;
  });
}

/** Invoke `external.open` through the public preload bridge and return its result. */
export async function openExternal(win: Page, url: string): Promise<{ opened: boolean }> {
  return win.evaluate(
    async (u) => (await (window as unknown as { api: Bridge }).api.invoke('external.open', { url: u })) as { opened: boolean },
    url,
  );
}

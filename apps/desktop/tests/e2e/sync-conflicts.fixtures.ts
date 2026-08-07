import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for the SOU-91 sync conflict-resolution suite.
 *
 * The conflict engine surfaces clashes only during a live pull→resolve→push
 * against a hub — machinery that needs two laptops + pairing (SOU-82, a later
 * ticket). Here a blocked field-clash is seeded through the app's OWN e2e-only
 * IPC channel (`sync.test.seedConflict`), which writes through the real
 * `SqliteLocalSyncRepository` on the app's own DB connection — same process, so
 * no encrypted-DB WAL race from a second writer. The channel exists only in the
 * `--mode e2e` build; production never registers it (like `plan.set`).
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** User-facing copy asserted on, mirrored from i18n {fr,ar}.json (`sync.*`). */
export const STR: Record<
  Locale,
  {
    nav: string;
    navAria: string;
    title: string;
    subtitle: string;
    inboxTitle: string;
    inboxEmptyTitle: string;
    openPopup: string;
    popupTitle: string;
    tabFieldClash: string;
    tabDeleteVsEdit: string;
    tabDuplicates: string;
    takeMine: string;
    takeTheirs: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    nav: 'Synchronisation',
    navAria: 'Navigation principale',
    title: 'Synchronisation',
    subtitle: 'Échangez les modifications avec le hub de votre centre',
    inboxTitle: 'Conflits en attente',
    inboxEmptyTitle: 'Aucun conflit',
    openPopup: 'Ouvrir la résolution',
    popupTitle: 'Résolution de conflits',
    tabFieldClash: 'Champs',
    tabDeleteVsEdit: 'Suppression vs modification',
    tabDuplicates: 'Doublons',
    takeMine: 'Prendre ma version',
    takeTheirs: 'Prendre leur version',
    dir: 'ltr',
  },
  ar: {
    nav: 'المزامنة',
    navAria: 'التنقل الرئيسي',
    title: 'المزامنة',
    subtitle: 'تبادل التعديلات مع مركز الخادم',
    inboxTitle: 'تعارضات معلّقة',
    inboxEmptyTitle: 'لا توجد تعارضات',
    openPopup: 'فتح الحل',
    popupTitle: 'حل التعارضات',
    tabFieldClash: 'الحقول',
    tabDeleteVsEdit: 'حذف مقابل تعديل',
    tabDuplicates: 'المكررات',
    takeMine: 'أخذ نسختي',
    takeTheirs: 'أخذ نسختهم',
    dir: 'rtl',
  },
};

export type Launched = { app: ElectronApplication; win: Page; userDataDir: string };

function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sync-'));
}

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win, userDataDir };
}

/** Seed the admin + remembered session over the bridge, then reload. */
async function provisionAdmin(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
}

/** Seed one blocked field-clash through the e2e-only IPC channel. */
async function seedFieldClash(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ ok: boolean }> } }).api;
    await api.invoke('sync.test.seedConflict', {
      entityType: 'students',
      entityId: 'stu_00000000000000000000000001',
      version: 2,
      fields: ['phone'],
      mineEntity: { id: 'stu_00000000000000000000000001', phone: '0777777777' },
      theirsEntity: { id: 'stu_00000000000000000000000001', phone: '0666666666' },
    });
  });
}

/**
 * Launch, provision the admin, seed a blocked conflict (if requested) through
 * the app's own connection, then reload so the shell + inbox pick it up.
 */
export async function bootWithClash(locale: Locale, plan: PlanId, seed: boolean): Promise<Launched> {
  const userDataDir = freshUserDataDir();
  const live = await launch(locale, plan, userDataDir);
  await provisionAdmin(live.win);
  if (seed) await seedFieldClash(live.win);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/** Resolve a conflict through the public bridge (same path the popup uses). */
export async function bridgeResolve(
  win: Page,
  input: { entityType: string; entityId: string; resolution: { choice: 'take-mine' | 'take-theirs' } },
): Promise<void> {
  await win.evaluate(async (req) => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ ok: boolean }> };
    }).api;
    await api.invoke('sync.conflict.resolve', req);
  }, input);
}

export { freshUserDataDir };

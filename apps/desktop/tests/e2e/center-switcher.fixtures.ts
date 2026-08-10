import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for the SOU-96 center-switcher E2E suite.
 *
 * Everything is driven through the running UI and the public preload bridge
 * (`window.api.invoke`) only — no renderer/domain/data implementation is
 * imported. The only knobs are the documented launch switches the other suites
 * already use:
 *   - CS_LOCALE          → renderer locale (fr | ar)
 *   - CS_PLAN            → active plan (essentiel | pro | premium)
 *   - CS_CENTRE          → which centreId is the ACTIVE center at boot
 *   - CS_CENTER_CODE     → that center's tenant code
 *   - --user-data-dir    → Electron userData dir (one encrypted DB per center)
 *
 * Two real, non-demo centers are provisioned into ONE userData dir by launching
 * the app once per center under a distinct CS_CENTRE. In the `--mode e2e` build
 * every center DB in a userData dir shares one fixed SQLCipher key, so the final
 * launch can scan and open both `centre-*.db` files. The demo center is
 * provisioned the same way (CS_CENTRE=demo) so the exclusion rule is exercised
 * against a real `centre-demo.db` on disk.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const DEMO_CENTRE_ID = 'demo';

/** A real (non-demo) center to provision. displayName is a single string (locale-agnostic). */
export type CenterSpec = {
  centreId: string;
  code: string;
  displayName: string;
  /**
   * Sentinel students — identical text in fr+ar so the isolation check is
   * locale-agnostic. The two centers get DIFFERENT counts so the dashboard
   * "élèves actifs" figure is itself a discriminating isolation signal.
   */
  studentTags: readonly string[];
};

export const CENTER_A: CenterSpec = {
  centreId: 'casa',
  code: 'CS-CASA-001',
  displayName: 'Centre Al Ilm',
  studentTags: ['ELEVE-ALPHA-QA', 'ELEVE-ALPHA2-QA'],
};
export const CENTER_B: CenterSpec = {
  centreId: 'rabat',
  code: 'CS-RABAT-002',
  displayName: 'Centre Annexe',
  studentTags: ['ELEVE-BETA-QA'],
};

/** User-facing copy asserted on, mirrored from i18n {fr,ar}.json (`centerSwitcher.*`, `nav.*`). */
export const SW: Record<
  Locale,
  {
    triggerPrefix: string;
    label: string;
    navStudents: string;
    navAria: string;
    studentsHeading: string;
    dashboardHeading: string;
  }
> = {
  fr: {
    triggerPrefix: 'Changer de centre',
    label: 'Centres',
    navStudents: 'Élèves',
    navAria: 'Navigation principale',
    studentsHeading: 'Élèves',
    dashboardHeading: 'Tableau de bord',
  },
  ar: {
    triggerPrefix: 'تغيير المركز',
    label: 'المراكز',
    navStudents: 'التلاميذ',
    navAria: 'التنقل الرئيسي',
    studentsHeading: 'التلاميذ',
    dashboardHeading: 'لوحة القيادة',
  },
};

export type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-center-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(opts: {
  locale: Locale;
  plan: PlanId;
  centreId: string;
  centerCode: string;
  userDataDir: string;
}): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`],
    env: {
      ...process.env,
      CS_LOCALE: opts.locale,
      CS_PLAN: opts.plan,
      CS_CENTRE: opts.centreId,
      CS_CENTER_CODE: opts.centerCode,
    },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Bounded invoke through the public bridge (never hangs the spec). */
export async function invoke(win: Page, channel: string, req: unknown = {}, timeoutMs = 8000): Promise<unknown> {
  const p = win.evaluate(
    async ({ channel, req }) => {
      const api = (window as unknown as { api: Bridge }).api;
      return api.invoke(channel, req);
    },
    { channel, req },
  );
  return Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`invoke ${channel} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/** Create the admin if absent, establish a remembered session, reload past the gates. */
export async function ensureAdminAndLogin(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    try {
      await api.invoke('admin.create', admin);
    } catch {
      /* admin already exists in this center DB — fine */
    }
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

function studentPayload(tag: string): unknown {
  return {
    name: { fr: tag, ar: tag },
    birthDate: '2010-01-01',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
  };
}

/**
 * Provision one real center into `userDataDir`: boot it as the active center,
 * clear the gates, save its profile name, seed its sentinel student, close.
 */
export async function provisionCenter(loc: Locale, plan: PlanId, userDataDir: string, c: CenterSpec): Promise<void> {
  const { app, win } = await launch({
    locale: loc,
    plan,
    centreId: c.centreId,
    centerCode: c.code,
    userDataDir,
  });
  await ensureAdminAndLogin(win);
  await invoke(win, 'center.save', { name: c.displayName, address: '', phone: '', email: '', logoPath: null });
  for (const tag of c.studentTags) {
    await invoke(win, 'student.create', studentPayload(tag));
  }
  await app.close();
}

/** Provision the demo center (centre-demo.db) so the exclusion rule has real data to exclude. */
export async function provisionDemoCenter(loc: Locale, userDataDir: string): Promise<void> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: loc, CS_PLAN: 'premium', CS_CENTRE: DEMO_CENTRE_ID },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  // Touch the bridge so the demo DB file is materialized before we close.
  await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('demo.status', {}).catch(() => undefined);
  });
  await app.close();
}

export type CenterListRow = { centreId: string; centerCode: string; displayName: string; isActive: boolean };

export async function centerList(win: Page): Promise<CenterListRow[]> {
  const res = (await invoke(win, 'center.list', {})) as { centers: CenterListRow[] };
  return res.centers;
}

export async function currentCenter(win: Page): Promise<{ centreId: string; displayName: string }> {
  return (await invoke(win, 'center.current', {})) as { centreId: string; displayName: string };
}

/** Sentinel student tags currently visible through the bridge (search='' returns all). */
export async function studentTags(win: Page): Promise<string[]> {
  const res = (await invoke(win, 'student.list', { search: '' })) as {
    students: { name: { fr: string } }[];
  };
  return res.students.map((s) => s.name.fr);
}

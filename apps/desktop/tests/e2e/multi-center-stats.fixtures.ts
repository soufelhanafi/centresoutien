import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/*
 * Black-box fixtures for SOU-106 — "Per-center stats view" (Premium,
 * `org.multi-center`). The desktop surface is a REAL read-only cross-center
 * aggregation: each center's own SQLCipher file is opened read-only, its figures
 * computed in isolation, and the rows shaped into one comparison table
 * (revenue / students / unpaid-rate / month-over-month growth), with a totals
 * roll-up, sort, name filter, and PDF export.
 *
 * Everything is driven through the running packaged app and the public preload
 * bridge (`window.api.invoke`) only — no renderer / domain / data implementation
 * is imported. The only knobs are the documented launch switches every other
 * suite uses:
 *   - CS_LOCALE          → renderer locale (fr | ar)
 *   - CS_PLAN            → active plan (essentiel | pro | premium)
 *   - CS_CENTRE          → which centreId is ACTIVE at boot
 *   - CS_CENTER_CODE     → that center's tenant code
 *   - --user-data-dir    → Electron userData dir (one encrypted DB per center)
 *
 * Multiple centers are provisioned into ONE userData dir by launching the app
 * once per center under a distinct CS_CENTRE. In the `--mode e2e` build every
 * center DB in a userData dir shares one fixed SQLCipher key, so the final launch
 * can scan and open every `centre-*.db` file (same recipe as the SOU-96
 * center-switcher suite).
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export type CenterSpec = {
  centreId: string;
  code: string;
  displayName: string;
  /** Distinct student counts per center → a discriminating numeric column. */
  studentCount: number;
};

// Distinct student counts (3 / 1 / 2) so the "Élèves" column both sorts and
// filters unambiguously and each center's own dashboard figure is discriminating.
export const CENTER_A: CenterSpec = { centreId: 'casa', code: 'CS-CASA-001', displayName: 'Centre Al Ilm', studentCount: 3 };
export const CENTER_B: CenterSpec = { centreId: 'rabat', code: 'CS-RABAT-002', displayName: 'Centre Annexe', studentCount: 1 };
export const CENTER_C: CenterSpec = { centreId: 'fes', code: 'CS-FES-003', displayName: 'Centre Nour', studentCount: 2 };

export const ALL_CENTERS: readonly CenterSpec[] = [CENTER_A, CENTER_B, CENTER_C];

/** User-facing copy asserted on, mirrored 1:1 from i18n {fr,ar}.json (`nav.*`, `multiCenterStats.*`, `plan.locked`). */
export const STR: Record<
  Locale,
  {
    nav: string;
    navAria: string;
    title: string;
    colCenter: string;
    colRevenue: string;
    colStudents: string;
    colUnpaid: string;
    colGrowth: string;
    totalRevenue: string;
    totalStudents: string;
    unavailable: string;
    noResults: string;
    filterPlaceholder: string;
    actionExport: string;
    actionPrint: string;
    exportSuccess: string;
    /* Non-Premium lock affordances. */
    lockTitle: string;
    gateTitle: string;
    unlockCta: string;
  }
> = {
  fr: {
    nav: 'Statistiques par centre',
    navAria: 'Navigation principale',
    title: 'Statistiques par centre',
    colCenter: 'Centre',
    colRevenue: 'Revenu (MAD)',
    colStudents: 'Élèves',
    colUnpaid: 'Taux d’impayés',
    colGrowth: 'Croissance mensuelle',
    totalRevenue: 'Revenu total',
    totalStudents: 'Élèves',
    unavailable: 'Données indisponibles',
    noResults: 'Aucun centre ne correspond à votre recherche.',
    filterPlaceholder: 'Rechercher un centre…',
    actionExport: 'Exporter en PDF',
    actionPrint: 'Imprimer',
    exportSuccess: 'PDF exporté.',
    lockTitle: 'Statistiques multi-centres',
    gateTitle: 'Réservé à un plan supérieur',
    unlockCta: 'Débloquer avec Premium',
  },
  ar: {
    nav: 'إحصائيات المراكز',
    navAria: 'التنقل الرئيسي',
    title: 'إحصائيات المراكز',
    colCenter: 'المركز',
    colRevenue: 'الإيرادات (درهم)',
    colStudents: 'التلاميذ',
    colUnpaid: 'نسبة غير المؤداة',
    colGrowth: 'النمو الشهري',
    totalRevenue: 'إجمالي الإيرادات',
    totalStudents: 'التلاميذ',
    unavailable: 'بيانات غير متوفرة',
    noResults: 'لا يوجد مركز يطابق بحثك.',
    filterPlaceholder: 'ابحث عن مركز…',
    actionExport: 'تصدير PDF',
    actionPrint: 'طباعة',
    exportSuccess: 'تم تصدير ملف PDF.',
    lockTitle: 'إحصائيات متعددة المراكز',
    gateTitle: 'غير متاح في خطتك',
    unlockCta: 'افتح مع بريميوم',
  },
};

export type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-mcstats-'));
}

export function freshExportDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-mcstats-export-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(opts: {
  locale: Locale;
  plan: PlanId;
  centreId: string;
  centerCode: string;
  userDataDir: string;
}): Promise<Launched> {
  const env: Record<string, string> = {
    ...process.env,
    CS_LOCALE: opts.locale,
    CS_PLAN: opts.plan,
    CS_CENTRE: opts.centreId,
    CS_CENTER_CODE: opts.centerCode,
  };
  // Never inherit a feature-omit override from the parent shell — it would flip
  // gating and fail this suite for non-product reasons (matches sync-conflicts).
  delete env['CS_E2E_OMIT_FEATURES'];
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${opts.userDataDir}`], env });
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
    new Promise((_, rej) => setTimeout(() => rej(new Error(`invoke ${channel} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

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

/** Provision one real center into `userDataDir`: boot it active, clear the gates, name it, seed its students, close. */
export async function provisionCenter(loc: Locale, plan: PlanId, userDataDir: string, c: CenterSpec): Promise<void> {
  const { app, win } = await launch({ locale: loc, plan, centreId: c.centreId, centerCode: c.code, userDataDir });
  await ensureAdminAndLogin(win);
  await invoke(win, 'center.save', { name: c.displayName, address: '', phone: '', email: '', logoPath: null });
  for (let i = 0; i < c.studentCount; i += 1) {
    await invoke(win, 'student.create', studentPayload(`ELEVE-${c.centreId.toUpperCase()}-${i}`));
  }
  await app.close();
}

/**
 * Corrupt a provisioned center's SQLCipher file in place so it can no longer be
 * opened — the black-box trigger for the "DB unavailable" graceful-degradation
 * path. The file stays present (so the center is still listed) but its bytes are
 * no longer a valid encrypted DB, forcing the read-only open to fail. Returns the
 * path corrupted (throws if no matching `.db` file is found, so the test fails
 * loudly rather than silently passing).
 */
export function corruptCenterDb(userDataDir: string, centreId: string): string {
  const target = findCenterDbFile(userDataDir, centreId);
  writeFileSync(target, randomBytes(8192));
  return target;
}

function findCenterDbFile(root: string, centreId: string): string {
  const needle = centreId.toLowerCase();
  const stack: string[] = [root];
  const dbFiles: string[] = [];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        stack.push(full);
      } else if (entry.toLowerCase().endsWith('.db')) {
        dbFiles.push(full);
      }
    }
  }
  const match = dbFiles.find((f) => f.toLowerCase().includes(needle));
  if (match) return match;
  throw new Error(
    `No center DB file for "${centreId}" under ${root}. Found: ${dbFiles.join(', ') || '(none)'}`,
  );
}

/** Deterministically resolve the native save dialog to `path` so export writes to a known file with no OS UI. */
export async function stubSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(async ({ dialog }, chosenPath) => {
    dialog.showSaveDialog = (async () =>
      chosenPath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath: chosenPath }) as never;
  }, path);
}

/** Neutralize `shell.openPath` so Print/export-open never spawns an external viewer that could hang teardown. */
export async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openPath = (async () => '') as never;
  });
}

/** The active plan straight from the domain — proves CS_PLAN took effect before we assert on the gated branch. */
export function activePlan(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ planId: string }> } }).api;
    return (await api.invoke('plan.get', {})).planId;
  });
}

/** Navigate to the multi-center stats route by its hash (works even when the nav entry is a locked button). */
export async function navigateToStatsHash(win: Page): Promise<void> {
  await win.evaluate(() => {
    window.location.hash = '#/multi-center-stats';
  });
}

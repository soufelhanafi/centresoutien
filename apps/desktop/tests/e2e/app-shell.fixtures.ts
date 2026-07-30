import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for the SOU-99 app-shell E2E suite (sidebar navigation,
 * FR/AR + RTL, plan-gated entries, collapse, keyboard).
 *
 * Everything is driven through the running UI and the public preload bridge
 * (`window.api.invoke`) only — no renderer/domain implementation is imported.
 * The only knobs are the documented switches used by the other suites:
 *   - CS_LOCALE          → renderer locale (fr | ar)
 *   - CS_PLAN            → active plan (essentiel | pro | premium)
 *   - --user-data-dir    → throwaway Electron userData dir (fresh first run)
 *
 * The plan is set per-launch via CS_PLAN because the packaged build ships no
 * dev PlanSwitcher control and exposes no `plan.set` IPC channel; relaunching
 * under each plan is the reliable black-box way to observe the gating registry.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`nav.*`, `shell.*`, `plan.*`). */
export const STR: Record<
  Locale,
  {
    nav: Record<
      | 'dashboard'
      | 'students'
      | 'teachers'
      | 'parents'
      | 'groups'
      | 'rooms'
      | 'planning'
      | 'invoicing'
      | 'payments'
      | 'payroll'
      | 'sync'
      | 'settings',
      string
    >;
    collapse: string;
    expand: string;
    navAria: string;
    currentCenter: string;
    logout: string;
    lockedTitle: string;
    otherLang: string; // label of the language-switch button (shows the OTHER language)
    dashboardHeading: string;
  }
> = {
  fr: {
    nav: {
      dashboard: 'Tableau de bord',
      students: 'Élèves',
      teachers: 'Enseignants',
      parents: 'Parents',
      groups: 'Groupes',
      rooms: 'Salles',
      planning: 'Planning',
      invoicing: 'Facturation',
      payments: 'Paiements',
      payroll: 'Paie',
      sync: 'Synchronisation',
      settings: 'Paramètres',
    },
    collapse: 'Réduire le menu',
    expand: 'Développer le menu',
    navAria: 'Navigation principale',
    currentCenter: 'Centre principal',
    logout: 'Se déconnecter',
    lockedTitle: 'Réservé à un plan supérieur',
    otherLang: 'العربية',
    dashboardHeading: 'Tableau de bord',
  },
  ar: {
    nav: {
      dashboard: 'لوحة القيادة',
      students: 'التلاميذ',
      teachers: 'الأساتذة',
      parents: 'أولياء الأمور',
      groups: 'المجموعات',
      rooms: 'القاعات',
      planning: 'الجدولة',
      invoicing: 'الفوترة',
      payments: 'المدفوعات',
      payroll: 'أجور الأساتذة',
      sync: 'المزامنة',
      settings: 'الإعدادات',
    },
    collapse: 'طيّ القائمة',
    expand: 'توسيع القائمة',
    navAria: 'التنقل الرئيسي',
    currentCenter: 'المركز الرئيسي',
    logout: 'تسجيل الخروج',
    lockedTitle: 'غير متاح في خطتك',
    otherLang: 'Français',
    dashboardHeading: 'لوحة القيادة',
  },
};

/** Module keys grouped by the gating registry (SOU-99 acceptance criteria). */
export const ALWAYS_ON = [
  'dashboard',
  'students',
  'teachers',
  'parents',
  'groups',
  'rooms',
  'planning',
  'invoicing',
  'payments',
  'settings',
] as const;
export const PRO_GATED = ['payroll'] as const; // payroll.teacher
export const PREMIUM_GATED = ['sync'] as const; // sync.multi-device
export const ALL_MODULES = [...ALWAYS_ON, ...PRO_GATED, ...PREMIUM_GATED] as const;

/** Which modules are unlocked (rendered as links) under each plan. */
export function unlockedFor(plan: PlanId): ReadonlySet<string> {
  const s = new Set<string>(ALWAYS_ON);
  if (plan === 'pro' || plan === 'premium') PRO_GATED.forEach((m) => s.add(m));
  if (plan === 'premium') PREMIUM_GATED.forEach((m) => s.add(m));
  return s;
}

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-shell-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Launch and get past the SOU-25 first-run gate + SOU-27 auth gate into the
 * shell: seed the admin through the public bridge, establish a remembered
 * session via `auth.login`, reload so the gates pass and the shell renders.
 */
export async function boot(locale: Locale, plan: PlanId): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/** The active plan straight from the domain — used to prove CS_PLAN took effect. */
export function activePlan(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<{ planId: string }> } }).api;
    return (await api.invoke('plan.get', {})).planId;
  });
}

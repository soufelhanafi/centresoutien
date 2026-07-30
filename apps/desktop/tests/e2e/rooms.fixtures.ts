import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-34 — Rooms CRUD UI (list / form / archive / restore).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer implementation is imported. The only
 * string values referenced here mirror the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing localization contract, exactly
 * as the SOU-39 students fixtures do.
 *
 * The Rooms screen currently runs against an in-memory mock gateway (SOU-33 will
 * publish the SQLite-backed `room.*` channels). The mock seeds two rooms
 * ("Salle 1", "Salle 2") and resets on reload, so specs interact within a single
 * page session and each test boots a fresh app for isolation.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`rooms.*`, `nav.*`, `errors.*`). */
export const STR: Record<
  Locale,
  {
    navRooms: string;
    title: string;
    subtitle: string;
    newBtn: string;
    tabs: { active: string; archived: string };
    table: { name: string; capacity: string; sessions: string; state: string };
    state: { active: string; archived: string };
    row: { menu: string; edit: string; archive: string; restore: string };
    empty: { title: string };
    archivedEmpty: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      name: string;
      capacity: string;
      create: string;
      save: string;
      createSuccess: string;
      editSuccess: string;
    };
    archive: { title: string; confirm: string; success: string };
    restore: { success: string };
    errors: { required: string; notInteger: string };
  }
> = {
  fr: {
    navRooms: 'Salles',
    title: 'Salles',
    subtitle: 'Gérez les salles de votre centre.',
    newBtn: 'Nouvelle salle',
    tabs: { active: 'Actives', archived: 'Archivées' },
    table: { name: 'Nom', capacity: 'Capacité', sessions: 'Séances', state: 'État' },
    state: { active: 'Active', archived: 'Archivée' },
    row: { menu: 'Actions de la salle', edit: 'Modifier', archive: 'Archiver', restore: 'Restaurer' },
    empty: { title: "Aucune salle pour l'instant" },
    archivedEmpty: { title: 'Aucune salle archivée' },
    form: {
      createTitle: 'Nouvelle salle',
      editTitle: 'Modifier la salle',
      name: 'Nom',
      capacity: 'Capacité',
      create: 'Créer la salle',
      save: 'Enregistrer',
      createSuccess: 'Salle créée',
      editSuccess: 'Modifications enregistrées',
    },
    archive: { title: 'Archiver cette salle ?', confirm: 'Archiver', success: 'Salle archivée' },
    restore: { success: 'Salle restaurée' },
    errors: { required: 'Ce champ est requis', notInteger: 'Saisissez un nombre entier' },
  },
  ar: {
    navRooms: 'القاعات',
    title: 'القاعات',
    subtitle: 'أدر قاعات مركزك.',
    newBtn: 'قاعة جديدة',
    tabs: { active: 'النشطة', archived: 'المؤرشفة' },
    table: { name: 'الاسم', capacity: 'السعة', sessions: 'الحصص', state: 'الحالة' },
    state: { active: 'نشطة', archived: 'مؤرشفة' },
    row: { menu: 'إجراءات القاعة', edit: 'تعديل', archive: 'أرشفة', restore: 'استعادة' },
    empty: { title: 'لا توجد قاعات بعد' },
    archivedEmpty: { title: 'لا توجد قاعات مؤرشفة' },
    form: {
      createTitle: 'قاعة جديدة',
      editTitle: 'تعديل القاعة',
      name: 'الاسم',
      capacity: 'السعة',
      create: 'إنشاء القاعة',
      save: 'حفظ',
      createSuccess: 'تم إنشاء القاعة',
      editSuccess: 'تم حفظ التعديلات',
    },
    archive: { title: 'أرشفة هذه القاعة؟', confirm: 'أرشفة', success: 'تمت أرشفة القاعة' },
    restore: { success: 'تمت استعادة القاعة' },
    errors: { required: 'هذا الحقل مطلوب', notInteger: 'أدخل عددًا صحيحًا' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-rooms-'));
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
 * Launch and get past the first-run + auth gates into the shell: seed the admin
 * through the public bridge, establish a remembered session, reload so the gates
 * pass and the shell renders. Same recipe the students suite uses.
 */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
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

/** Navigate to the Rooms list via the sidebar and fail fast if it crashed. */
export async function gotoRooms(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navRooms, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

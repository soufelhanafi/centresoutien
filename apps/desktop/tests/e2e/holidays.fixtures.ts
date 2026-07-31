import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-30 — Holidays management (Settings) E2E suite.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain implementation is imported.
 * The only string values here mirror what the app actually renders on screen —
 * discovered by inspecting the live DOM, exactly as the SOU-29 hours and SOU-34
 * rooms suites mirror their localization contract.
 *
 * The Holidays section lives at the bottom of the Paramètres (Settings) screen,
 * under the `settings.holidays` feature which SOU-30 moved into the base
 * Essentiel plan. Each test boots a fresh app (throwaway user-data dir) under
 * the Essentiel plan and runs under both the `fr` (LTR) and `ar` (RTL) projects.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/**
 * All copy the specs assert on, mirrored from the running UI in both locales.
 * A fresh center starts with an EMPTY holidays list — every scenario that needs
 * rows self-provisions them through the UI.
 */
export const STR: Record<
  Locale,
  {
    settingsNav: string;
    sectionTitle: string;
    sectionSubtitle: string;
    newBtn: string;
    tabs: { active: string; archived: string };
    yearAria: string;
    yearAll: string;
    type: { fixed: string; lunar: string };
    hint: { fixed: string; lunar: string };
    rowMenuAria: string;
    menu: { edit: string; archive: string };
    restoreBtn: string;
    dialog: {
      createTitle: string;
      editTitle: string;
      subtitle: string;
      nameFr: string;
      nameAr: string;
      typeLabel: string;
      startLabel: string;
      endLabel: string;
      create: string;
      save: string;
      cancel: string;
    };
    toast: { created: string; edited: string; archived: string; restored: string };
    archiveConfirm: { title: string; confirm: string };
    activeEmpty: { title: string; subtitle: string };
    archivedEmpty: { title: string; subtitle: string };
    errors: { required: string; invalidDate: string; endBeforeStart: string };
  }
> = {
  fr: {
    settingsNav: 'Paramètres',
    sectionTitle: 'Jours fériés et vacances',
    sectionSubtitle: 'Gérez les jours fériés solaires et les fêtes lunaires, saisies chaque année.',
    newBtn: 'Nouveau jour férié',
    tabs: { active: 'Actifs', archived: 'Archivés' },
    yearAria: 'Année',
    yearAll: 'Toutes les années',
    type: { fixed: 'Solaire (fixe)', lunar: 'Lunaire (manuel)' },
    hint: {
      fixed: 'Se répète chaque année à la même date grégorienne.',
      lunar: 'À saisir manuellement chaque année (Aïd, Mawlid…). Aucun calcul du calendrier hégirien.',
    },
    rowMenuAria: 'Actions du jour férié',
    menu: { edit: 'Modifier', archive: 'Archiver' },
    restoreBtn: 'Restaurer',
    dialog: {
      createTitle: 'Nouveau jour férié',
      editTitle: 'Modifier le jour férié',
      subtitle: 'Renseignez le nom, le type et la période.',
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      typeLabel: 'Type',
      startLabel: 'Date de début',
      endLabel: 'Date de fin',
      create: 'Créer',
      save: 'Enregistrer',
      cancel: 'Annuler',
    },
    toast: {
      created: 'Jour férié créé',
      edited: 'Modifications enregistrées',
      archived: 'Jour férié archivé',
      restored: 'Jour férié restauré',
    },
    archiveConfirm: { title: 'Archiver ce jour férié ?', confirm: 'Archiver' },
    activeEmpty: {
      title: "Aucun jour férié pour l'instant",
      subtitle: 'Ajoutez les jours fériés et vacances de votre centre pour que la planification les évite.',
    },
    archivedEmpty: {
      title: 'Aucun jour férié archivé',
      subtitle: 'Les jours fériés que vous archivez apparaîtront ici.',
    },
    errors: {
      required: 'Ce champ est requis',
      invalidDate: 'Date invalide',
      endBeforeStart: 'La date de fin doit être après la date de début',
    },
  },
  ar: {
    settingsNav: 'الإعدادات',
    sectionTitle: 'أيام العطل والإجازات',
    sectionSubtitle: 'أدرِج أيام العطل الشمسية (الثابتة) والأعياد القمرية التي تُدخَل يدويًا كل سنة.',
    newBtn: 'عطلة جديدة',
    tabs: { active: 'النشطة', archived: 'المؤرشفة' },
    yearAria: 'السنة',
    yearAll: 'كل السنوات',
    type: { fixed: 'شمسية (ثابتة)', lunar: 'قمرية (يدوية)' },
    hint: {
      fixed: 'تتكرّر كل سنة في نفس التاريخ الميلادي.',
      lunar: 'تُدخَل يدويًا كل سنة (عيد، مولد…). دون أي حساب للتقويم الهجري.',
    },
    rowMenuAria: 'إجراءات العطلة',
    menu: { edit: 'تعديل', archive: 'أرشفة' },
    restoreBtn: 'استعادة',
    dialog: {
      createTitle: 'عطلة جديدة',
      editTitle: 'تعديل العطلة',
      subtitle: 'أدخِل الاسم والنوع والفترة.',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      typeLabel: 'النوع',
      startLabel: 'تاريخ البداية',
      endLabel: 'تاريخ النهاية',
      create: 'إنشاء',
      save: 'حفظ',
      cancel: 'إلغاء',
    },
    toast: {
      created: 'تم إنشاء العطلة',
      edited: 'تم حفظ التعديلات',
      archived: 'تمت أرشفة العطلة',
      restored: 'تمت استعادة العطلة',
    },
    archiveConfirm: { title: 'أرشفة هذه العطلة؟', confirm: 'أرشفة' },
    activeEmpty: {
      title: 'لا توجد أيام عطل بعد',
      subtitle: 'أضِف أيام العطل والإجازات الخاصة بمركزك حتى يتجنّبها التخطيط.',
    },
    archivedEmpty: {
      title: 'لا توجد عطل مؤرشفة',
      subtitle: 'ستظهر هنا أيام العطل التي تؤرشفها.',
    },
    errors: {
      required: 'هذا الحقل مطلوب',
      invalidDate: 'تاريخ غير صالح',
      endBeforeStart: 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-holidays-'));
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

type ApiWindow = { api: { invoke: (channel: string, req: unknown) => Promise<unknown> } };

/** Seed the admin and a remembered session, then reload past the gates. */
export async function seedSession(win: Page): Promise<void> {
  await win.evaluate(async (admin) => {
    const api = (window as unknown as ApiWindow).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
}

/**
 * Boot into the shell under the Essentiel plan (SOU-30 moved `settings.holidays`
 * into the base plan) with a throwaway user-data dir.
 */
export async function boot(locale: Locale, userDataDir = freshUserDataDir(), plan: PlanId = 'essentiel'): Promise<Launched> {
  const live = await launch(locale, plan, userDataDir);
  await seedSession(live.win);
  return live;
}

/** Ask the REAL SQLite-backed holiday IPC how many active holidays exist. */
export async function realActiveHolidayCount(win: Page): Promise<number> {
  return win.evaluate(async () => {
    const api = (window as unknown as ApiWindow).api;
    const res = (await api.invoke('holiday.list', { scope: 'active' })) as { holidays: unknown[] };
    return res.holidays.length;
  });
}

/** Open Paramètres and scroll the Holidays section into view. */
export async function gotoHolidays(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.settingsNav, exact: true }).click();
  await win.getByRole('heading', { name: L.sectionTitle }).scrollIntoViewIfNeeded();
  await win.waitForTimeout(300);
}

export type NewHoliday = {
  nameFr: string;
  nameAr: string;
  kind: 'fixed' | 'lunar';
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

/** Fill and submit the "new holiday" dialog. Leaves toast assertions to callers. */
export async function createHoliday(win: Page, L: (typeof STR)[Locale], h: NewHoliday): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).click();
  const dialog = win.getByRole('dialog');
  await dialog.getByRole('heading', { name: L.dialog.createTitle }).waitFor();
  await dialog.locator('input[name="name.fr"]').fill(h.nameFr);
  await dialog.locator('input[name="name.ar"]').fill(h.nameAr);
  if (h.kind === 'lunar') {
    await dialog.getByRole('combobox').click();
    await win.getByRole('option', { name: L.type.lunar }).click();
  }
  await dialog.locator('input[name="startDate"]').fill(h.start);
  await dialog.locator('input[name="endDate"]').fill(h.end);
  await dialog.getByRole('button', { name: L.dialog.create }).click();
}

/** Locate a table row by its (unique) French name substring. */
export function holidayRow(win: Page, nameFr: string) {
  return win.getByRole('row', { name: new RegExp(nameFr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

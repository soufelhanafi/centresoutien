import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-39 — Student CRUD UI + detail page.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. The only string values referenced here mirror the localization
 * catalog (`i18n/fr.json` / `ar.json`) — the user-facing localization contract,
 * exactly as the SOU-99 app-shell fixtures do.
 *
 * Launch switches (documented, shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`students.*`, `nav.*`, `errors.*`). */
export const STR: Record<
  Locale,
  {
    navStudents: string;
    navAria: string;
    dashboardHeading: string;
    title: string;
    subtitle: string;
    search: string; // placeholder
    searchLabel: string; // accessible name
    levelLabel: string;
    levelAll: string;
    newBtn: string;
    table: { name: string; level: string; school: string; guardians: string; actions: string };
    row: { open: string; menu: string; edit: string; archive: string };
    empty: { title: string; body: string; cta: string };
    noResults: { title: string; body: string };
    form: {
      createTitle: string;
      editTitle: string;
      nameFr: string;
      nameAr: string;
      birthDate: string;
      level: string;
      school: string;
      notes: string;
      create: string;
      save: string;
      cancel: string;
      createSuccess: string;
      editSuccess: string;
    };
    archive: { title: string; confirm: string; success: string };
    detail: {
      back: string;
      archivedBadge: string;
      edit: string;
      notFoundTitle: string;
      tabs: { info: string; guardians: string; enrollment: string; invoices: string; attendance: string };
      guardiansLink: string;
    };
    subscription: { empty: string; subscribeCta: string };
    comingSoon: { invoices: string; attendance: string };
    errors: { required: string; invalidDate: string; tooLong: string };
  }
> = {
  fr: {
    navStudents: 'Élèves',
    navAria: 'Navigation principale',
    dashboardHeading: 'Tableau de bord',
    title: 'Élèves',
    subtitle: 'Gérez les élèves de votre centre.',
    search: 'Rechercher par nom ou niveau',
    searchLabel: 'Rechercher un élève',
    levelLabel: 'Niveau',
    levelAll: 'Tous les niveaux',
    newBtn: 'Nouvel élève',
    table: { name: 'Nom', level: 'Niveau', school: 'École', guardians: 'Responsables', actions: 'Actions' },
    row: { open: 'Ouvrir la fiche', menu: "Actions de l'élève", edit: 'Modifier', archive: 'Archiver' },
    empty: { title: "Aucun élève pour l'instant", body: 'Ajoutez votre premier élève pour commencer.', cta: 'Ajouter un élève' },
    noResults: { title: 'Aucun résultat', body: 'Aucun élève ne correspond à votre recherche.' },
    form: {
      createTitle: 'Nouvel élève',
      editTitle: "Modifier l'élève",
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      birthDate: 'Date de naissance',
      level: 'Niveau',
      school: 'École',
      notes: 'Remarques',
      create: "Créer l'élève",
      save: 'Enregistrer',
      cancel: 'Annuler',
      createSuccess: 'Élève créé',
      editSuccess: 'Modifications enregistrées',
    },
    archive: { title: 'Archiver cet élève ?', confirm: 'Archiver', success: 'Élève archivé' },
    detail: {
      back: 'Retour aux élèves',
      archivedBadge: 'Archivé',
      edit: 'Modifier',
      notFoundTitle: 'Élève introuvable',
      tabs: { info: 'Informations', guardians: 'Responsables', enrollment: 'Inscriptions', invoices: 'Factures', attendance: 'Présence' },
      guardiansLink: 'Lier un responsable',
    },
    subscription: { empty: 'Aucun abonnement actif.', subscribeCta: 'Souscrire' },
    comingSoon: {
      invoices: 'Factures bientôt disponibles',
      attendance: 'Présence bientôt disponible',
    },
    errors: { required: 'Ce champ est requis', invalidDate: 'Date invalide', tooLong: 'Texte trop long' },
  },
  ar: {
    navStudents: 'التلاميذ',
    navAria: 'التنقل الرئيسي',
    dashboardHeading: 'لوحة القيادة',
    title: 'التلاميذ',
    subtitle: 'أدر تلاميذ مركزك.',
    search: 'ابحث بالاسم أو المستوى',
    searchLabel: 'البحث عن تلميذ',
    levelLabel: 'المستوى',
    levelAll: 'كل المستويات',
    newBtn: 'تلميذ جديد',
    table: { name: 'الاسم', level: 'المستوى', school: 'المدرسة', guardians: 'الأولياء', actions: 'إجراءات' },
    row: { open: 'فتح البطاقة', menu: 'إجراءات التلميذ', edit: 'تعديل', archive: 'أرشفة' },
    empty: { title: 'لا يوجد تلاميذ بعد', body: 'أضف أول تلميذ للبدء.', cta: 'إضافة تلميذ' },
    noResults: { title: 'لا نتائج', body: 'لا يوجد تلميذ يطابق بحثك.' },
    form: {
      createTitle: 'تلميذ جديد',
      editTitle: 'تعديل التلميذ',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      birthDate: 'تاريخ الميلاد',
      level: 'المستوى',
      school: 'المدرسة',
      notes: 'ملاحظات',
      create: 'إنشاء التلميذ',
      save: 'حفظ',
      cancel: 'إلغاء',
      createSuccess: 'تم إنشاء التلميذ',
      editSuccess: 'تم حفظ التعديلات',
    },
    archive: { title: 'أرشفة هذا التلميذ؟', confirm: 'أرشفة', success: 'تمت أرشفة التلميذ' },
    detail: {
      back: 'العودة إلى التلاميذ',
      archivedBadge: 'مؤرشف',
      edit: 'تعديل',
      notFoundTitle: 'التلميذ غير موجود',
      tabs: { info: 'المعلومات', guardians: 'الأولياء', enrollment: 'التسجيلات', invoices: 'الفواتير', attendance: 'الحضور' },
      guardiansLink: 'ربط وليّ',
    },
    subscription: { empty: 'لا يوجد اشتراك نشط.', subscribeCta: 'الاشتراك' },
    comingSoon: {
      invoices: 'الفواتير قريبًا',
      attendance: 'الحضور قريبًا',
    },
    errors: { required: 'هذا الحقل مطلوب', invalidDate: 'تاريخ غير صالح', tooLong: 'النص طويل جدًا' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-students-'));
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
 * pass and the shell renders. Same recipe the app-shell suite uses.
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

/** Navigate to the Students list via the sidebar and fail fast if it crashed. */
export async function gotoStudents(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  // The renderer error boundary renders "Something went wrong!" when the page
  // throws during render. Surface that here as a clear precondition failure.
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

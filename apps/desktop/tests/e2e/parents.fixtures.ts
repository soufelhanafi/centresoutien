import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-41 — Parent (guardian) CRUD UI + detail sheet.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. The only string values referenced here mirror the localization
 * catalog (`i18n/fr.json` / `ar.json`) — the user-facing localization contract,
 * exactly as the SOU-39 students fixtures do.
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

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`parents.*`, `nav.*`, `guardian.*`, `students.*`, `errors.*`). */
export const STR: Record<
  Locale,
  {
    navParents: string;
    navStudents: string;
    title: string;
    subtitle: string;
    search: string; // placeholder
    searchLabel: string; // accessible name
    newBtn: string;
    row: { open: string; menu: string; edit: string; archive: string };
    empty: { title: string; body: string };
    noResults: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      name: string;
      phone: string;
      email: string;
      relation: string;
      create: string;
      save: string;
      createSuccess: string;
      editSuccess: string;
    };
    relation: { pere: string; mere: string; tuteur: string; autre: string };
    archive: { title: string; confirm: string; success: string };
    detail: {
      title: string;
      archivedBadge: string;
      edit: string;
      children: { title: string; add: string; empty: { title: string; body: string } };
    };
    student: {
      nameFr: string;
      nameAr: string;
      birthDate: string;
      level: string;
      create: string;
      createSuccess: string;
    };
    errors: { required: string; invalidPhone: string };
  }
> = {
  fr: {
    navParents: 'Parents',
    navStudents: 'Élèves',
    title: 'Parents',
    subtitle: 'Gérez les parents et tuteurs de votre centre.',
    search: 'Rechercher par nom ou téléphone',
    searchLabel: 'Rechercher un parent',
    newBtn: 'Nouveau parent',
    row: { open: 'Ouvrir la fiche', menu: 'Actions du parent', edit: 'Modifier', archive: 'Archiver' },
    empty: { title: "Aucun parent pour l'instant", body: 'Ajoutez votre premier parent pour commencer.' },
    noResults: { title: 'Aucun résultat' },
    form: {
      createTitle: 'Nouveau parent',
      editTitle: 'Modifier le parent',
      name: 'Nom complet',
      phone: 'Téléphone',
      email: 'E-mail',
      relation: 'Lien de parenté',
      create: 'Créer le parent',
      save: 'Enregistrer',
      createSuccess: 'Parent créé',
      editSuccess: 'Modifications enregistrées',
    },
    relation: { pere: 'Père', mere: 'Mère', tuteur: 'Tuteur', autre: 'Autre' },
    archive: { title: 'Archiver ce parent ?', confirm: 'Archiver', success: 'Parent archivé' },
    detail: {
      title: 'Fiche parent',
      archivedBadge: 'Archivé',
      edit: 'Modifier',
      children: {
        title: 'Élèves',
        add: 'Ajouter un élève',
        empty: { title: 'Aucun élève lié', body: 'Ajoutez un élève rattaché à ce parent.' },
      },
    },
    student: {
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      birthDate: 'Date de naissance',
      level: 'Niveau',
      create: "Créer l'élève",
      createSuccess: 'Élève créé',
    },
    errors: { required: 'Ce champ est requis', invalidPhone: 'Numéro de téléphone invalide' },
  },
  ar: {
    navParents: 'أولياء الأمور',
    navStudents: 'التلاميذ',
    title: 'أولياء الأمور',
    subtitle: 'أدِر أولياء الأمور والأوصياء في مركزك.',
    search: 'ابحث بالاسم أو الهاتف',
    searchLabel: 'ابحث عن ولي أمر',
    newBtn: 'ولي أمر جديد',
    row: { open: 'فتح البطاقة', menu: 'إجراءات ولي الأمر', edit: 'تعديل', archive: 'أرشفة' },
    empty: { title: 'لا يوجد أولياء أمور بعد', body: 'أضِف أول ولي أمر للبدء.' },
    noResults: { title: 'لا توجد نتائج' },
    form: {
      createTitle: 'ولي أمر جديد',
      editTitle: 'تعديل ولي الأمر',
      name: 'الاسم الكامل',
      phone: 'الهاتف',
      email: 'البريد الإلكتروني',
      relation: 'صلة القرابة',
      create: 'إنشاء ولي الأمر',
      save: 'حفظ',
      createSuccess: 'تم إنشاء ولي الأمر',
      editSuccess: 'تم حفظ التعديلات',
    },
    relation: { pere: 'الأب', mere: 'الأم', tuteur: 'وصي', autre: 'أخرى' },
    archive: { title: 'أرشفة ولي الأمر هذا؟', confirm: 'أرشفة', success: 'تمت أرشفة ولي الأمر' },
    detail: {
      title: 'بطاقة ولي الأمر',
      archivedBadge: 'مؤرشف',
      edit: 'تعديل',
      children: {
        title: 'الطلاب',
        add: 'إضافة طالب',
        empty: { title: 'لا يوجد طلاب مرتبطون', body: 'أضِف طالبًا مرتبطًا بولي الأمر هذا.' },
      },
    },
    student: {
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      birthDate: 'تاريخ الميلاد',
      level: 'المستوى',
      create: 'إنشاء التلميذ',
      createSuccess: 'تم إنشاء التلميذ',
    },
    errors: { required: 'هذا الحقل مطلوب', invalidPhone: 'رقم الهاتف غير صالح' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-parents-'));
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
 * pass and the shell renders. Same recipe the students / app-shell suites use.
 *
 * Default plan is `essentiel` — SOU-41 is gated by `core.parents`, available on
 * the default (Essentiel) plan, so this proves the feature is usable there.
 */
export async function boot(locale: Locale, plan: PlanId = 'essentiel'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
    // Replicate the wizard's `center.save` so the default niveau catalog seeds
    // (the level select on the quick-add student form needs options).
    await api.invoke('center.save', { name: 'Centre de Soutien', address: '', phone: '', email: '', logoPath: null });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/** Navigate to the Parents list via the sidebar. */
export async function gotoParents(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navParents, exact: true }).click();
  await win.waitForLoadState('domcontentloaded');
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

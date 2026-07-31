import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-50 — Group CRUD UI (list + filters / create / edit /
 * archive-restore / detail roster + quick add-student).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer implementation is imported. The only
 * string values referenced here mirror the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing localization contract, exactly
 * as the SOU-34 rooms fixtures do.
 *
 * NOTE ON THE MOCK BOUNDARY: per the SOU-50 frontend handoff the Groups screen is
 * wired to a gateway seam backed by a **mock read model** until SOU-127 lands
 * (roster contents + fill-%). These fixtures therefore verify UI surface and
 * behavior; they do not assume persistence to the real SQLite `group.*` gateway.
 * Each test boots a fresh app with a throwaway user-data dir for isolation.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`groups.*`, `nav.*`). */
export const STR: Record<
  Locale,
  {
    navGroups: string;
    title: string;
    subtitle: string;
    newBtn: string;
    tabs: { active: string; archived: string };
    kind: { regular: string; examPrep: string };
    filters: {
      subjectAll: string;
      levelAll: string;
      kindAll: string;
      subjectLabel: string;
      kindLabel: string;
      levelLabel: string;
    };
    table: { subject: string; level: string; teacher: string; room: string; fill: string; unassigned: string };
    fill: { full: string };
    row: { menu: string; open: string; edit: string; archive: string; restore: string };
    empty: { title: string; body: string; cta: string };
    archivedEmpty: { title: string };
    noResults: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      subject: string;
      subjectPlaceholder: string;
      room: string;
      roomPlaceholder: string;
      teacher: string;
      level: string;
      capacity: string;
      kind: string;
      create: string;
      save: string;
      createSuccess: string;
      editSuccess: string;
    };
    detail: { back: string; edit: string; archivedBadge: string };
    archiveConfirm: { title: string; confirm: string; success: string };
    restoreSuccess: string;
    errors: { required: string; notInteger: string; capacityTooSmall: string; invalidId: string };
    roster: {
      title: string;
      add: string;
      addTitle: string;
      studentLabel: string;
      month: string;
      addConfirm: string;
      addSuccess: string;
      remove: string;
      emptyTitle: string;
      pending: string;
    };
  }
> = {
  fr: {
    navGroups: 'Groupes',
    title: 'Groupes',
    subtitle: 'Créez et gérez les groupes de votre centre.',
    newBtn: 'Nouveau groupe',
    tabs: { active: 'Actifs', archived: 'Archivés' },
    kind: { regular: 'Régulier', examPrep: 'Prépa examen' },
    filters: {
      subjectAll: 'Toutes les matières',
      levelAll: 'Tous les niveaux',
      kindAll: 'Tous les types',
      subjectLabel: 'Filtrer par matière',
      kindLabel: 'Filtrer par type',
      levelLabel: 'Filtrer par niveau',
    },
    table: {
      subject: 'Matière',
      level: 'Niveau',
      teacher: 'Enseignant',
      room: 'Salle',
      fill: 'Remplissage',
      unassigned: 'Non affecté',
    },
    fill: { full: 'Complet' },
    row: { menu: 'Actions du groupe', open: 'Ouvrir', edit: 'Modifier', archive: 'Archiver', restore: 'Restaurer' },
    empty: {
      title: "Aucun groupe pour l'instant",
      body: 'Créez votre premier groupe pour organiser vos cours.',
      cta: 'Créer un groupe',
    },
    archivedEmpty: { title: 'Aucun groupe archivé' },
    noResults: { title: 'Aucun groupe ne correspond' },
    form: {
      createTitle: 'Nouveau groupe',
      editTitle: 'Modifier le groupe',
      subject: 'Matière',
      subjectPlaceholder: 'Choisir une matière',
      room: 'Salle',
      roomPlaceholder: 'Choisir une salle',
      teacher: 'Enseignant',
      level: 'Niveau',
      capacity: 'Capacité (places)',
      kind: 'Type',
      create: 'Créer le groupe',
      save: 'Enregistrer',
      createSuccess: 'Groupe créé',
      editSuccess: 'Modifications enregistrées',
    },
    detail: { back: 'Retour aux groupes', edit: 'Modifier', archivedBadge: 'Archivé' },
    archiveConfirm: { title: 'Archiver le groupe ?', confirm: 'Archiver', success: 'Groupe archivé' },
    restoreSuccess: 'Groupe restauré',
    errors: {
      required: 'Ce champ est requis',
      notInteger: 'Saisissez un nombre entier',
      capacityTooSmall: "La capacité doit être d'au moins 1",
      invalidId: 'Identifiant invalide',
    },
    roster: {
      title: 'Élèves inscrits',
      add: 'Ajouter un élève',
      addTitle: 'Ajouter un élève au groupe',
      studentLabel: 'Élève',
      month: 'Mois de début',
      addConfirm: 'Inscrire',
      addSuccess: 'Élève inscrit',
      remove: 'Retirer',
      emptyTitle: 'Aucun élève inscrit',
      pending: 'Read-model provisoire — les inscriptions réelles arrivent avec SOU-127.',
    },
  },
  ar: {
    navGroups: 'المجموعات',
    title: 'المجموعات',
    subtitle: 'أنشئ مجموعات مركزك وأدرها.',
    newBtn: 'مجموعة جديدة',
    tabs: { active: 'النشطة', archived: 'المؤرشفة' },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان' },
    filters: {
      subjectAll: 'كل المواد',
      levelAll: 'كل المستويات',
      kindAll: 'كل الأنواع',
      subjectLabel: 'تصفية حسب المادة',
      kindLabel: 'تصفية حسب النوع',
      levelLabel: 'تصفية حسب المستوى',
    },
    table: {
      subject: 'المادة',
      level: 'المستوى',
      teacher: 'الأستاذ',
      room: 'القاعة',
      fill: 'نسبة الامتلاء',
      unassigned: 'غير مُسند',
    },
    fill: { full: 'مكتمل' },
    row: { menu: 'إجراءات المجموعة', open: 'فتح', edit: 'تعديل', archive: 'أرشفة', restore: 'استعادة' },
    empty: {
      title: 'لا توجد مجموعات بعد',
      body: 'أنشئ مجموعتك الأولى لتنظيم دروسك.',
      cta: 'إنشاء مجموعة',
    },
    archivedEmpty: { title: 'لا توجد مجموعات مؤرشفة' },
    noResults: { title: 'لا توجد مجموعة مطابقة' },
    form: {
      createTitle: 'مجموعة جديدة',
      editTitle: 'تعديل المجموعة',
      subject: 'المادة',
      subjectPlaceholder: 'اختر مادة',
      room: 'القاعة',
      roomPlaceholder: 'اختر قاعة',
      teacher: 'الأستاذ',
      level: 'المستوى',
      capacity: 'السعة (مقاعد)',
      kind: 'النوع',
      create: 'إنشاء المجموعة',
      save: 'حفظ',
      createSuccess: 'تم إنشاء المجموعة',
      editSuccess: 'تم حفظ التعديلات',
    },
    detail: { back: 'العودة إلى المجموعات', edit: 'تعديل', archivedBadge: 'مؤرشفة' },
    archiveConfirm: { title: 'أرشفة المجموعة؟', confirm: 'أرشفة', success: 'تمت أرشفة المجموعة' },
    restoreSuccess: 'تمت استعادة المجموعة',
    errors: {
      required: 'هذا الحقل مطلوب',
      notInteger: 'أدخل عددًا صحيحًا',
      capacityTooSmall: 'يجب أن تكون السعة 1 على الأقل',
      invalidId: 'معرّف غير صالح',
    },
    roster: {
      title: 'الطلبة المسجّلون',
      add: 'إضافة طالب',
      addTitle: 'إضافة طالب إلى المجموعة',
      studentLabel: 'الطالب',
      month: 'شهر البداية',
      addConfirm: 'تسجيل',
      addSuccess: 'تم تسجيل الطالب',
      remove: 'إزالة',
      emptyTitle: 'لا يوجد طلبة مسجّلون',
      pending: 'نموذج قراءة مؤقت — التسجيلات الفعلية ستصل مع SOU-127.',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-groups-'));
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
 * Launch, get past first-run + auth into the shell, and seed the real reference
 * data the Group create form needs (subjects, rooms, one teacher) through the
 * public bridge so the selects are populated. Same recipe the rooms suite uses.
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

/** Navigate to the Groups list via the sidebar. */
export async function gotoGroups(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navGroups, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-47 — Subjects (Matières) CRUD UI.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing localization contract, exactly
 * as the SOU-50 groups and SOU-124 teacher fixtures do.
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

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`subjects.*`, `nav.*`, `errors.*`). */
export const STR: Record<
  Locale,
  {
    navSubjects: string;
    navGroups: string;
    title: string;
    subtitle: string;
    newBtn: string;
    tabs: { active: string; inactive: string };
    table: { code: string; name: string; state: string; inUse: string; actions: string; noCode: string };
    state: { active: string; inactive: string };
    referenceKind: { group: string; formula: string; session: string };
    row: { menu: string; edit: string; deactivate: string; activate: string; delete: string };
    empty: { title: string; body: string; cta: string };
    inactiveEmpty: { title: string; body: string };
    form: {
      createTitle: string;
      editTitle: string;
      nameFr: string;
      nameAr: string;
      code: string;
      create: string;
      save: string;
      cancel: string;
      createSuccess: string;
      editSuccess: string;
    };
    activate: { success: string };
    deactivate: { success: string };
    delete: {
      title: string;
      confirm: string;
      cancel: string;
      success: string;
      blockedTitle: string;
      deactivateInstead: string;
    };
    errors: { required: string; invalidCode: string; duplicateCode: string };
  }
> = {
  fr: {
    navSubjects: 'Matières',
    navGroups: 'Groupes',
    title: 'Matières',
    subtitle: 'Configurez les matières proposées par votre centre.',
    newBtn: 'Nouvelle matière',
    tabs: { active: 'Actives', inactive: 'Inactives' },
    table: { code: 'Code', name: 'Nom', state: 'État', inUse: 'Utilisation', actions: 'Actions', noCode: '—' },
    state: { active: 'Active', inactive: 'Inactive' },
    referenceKind: { group: 'Groupe', formula: 'Formule', session: 'Séance' },
    row: { menu: 'Actions de la matière « {{name}} »', edit: 'Modifier', deactivate: 'Désactiver', activate: 'Réactiver', delete: 'Supprimer' },
    empty: {
      title: "Aucune matière pour l'instant",
      body: 'Ajoutez votre première matière pour commencer à composer des formules.',
      cta: 'Ajouter une matière',
    },
    inactiveEmpty: { title: 'Aucune matière inactive', body: 'Les matières que vous désactivez apparaîtront ici.' },
    form: {
      createTitle: 'Nouvelle matière',
      editTitle: 'Modifier la matière',
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      code: 'Code (optionnel)',
      create: 'Créer la matière',
      save: 'Enregistrer',
      cancel: 'Annuler',
      createSuccess: 'Matière créée',
      editSuccess: 'Modifications enregistrées',
    },
    activate: { success: 'Matière réactivée' },
    deactivate: { success: 'Matière désactivée' },
    delete: {
      title: 'Supprimer cette matière ?',
      confirm: 'Supprimer',
      cancel: 'Annuler',
      success: 'Matière supprimée',
      blockedTitle: 'Impossible de supprimer cette matière',
      deactivateInstead: 'Désactiver la matière',
    },
    errors: {
      required: 'Ce champ est requis',
      invalidCode: 'Code invalide (majuscules, chiffres, - et _ uniquement)',
      duplicateCode: 'Ce code est déjà utilisé par une autre matière',
    },
  },
  ar: {
    navSubjects: 'المواد',
    navGroups: 'المجموعات',
    title: 'المواد',
    subtitle: 'أعدّ المواد التي يقدّمها مركزك.',
    newBtn: 'مادة جديدة',
    tabs: { active: 'نشطة', inactive: 'غير نشطة' },
    table: { code: 'الرمز', name: 'الاسم', state: 'الحالة', inUse: 'الاستخدام', actions: 'إجراءات', noCode: '—' },
    state: { active: 'نشطة', inactive: 'غير نشطة' },
    referenceKind: { group: 'مجموعة', formula: 'صيغة', session: 'حصة' },
    row: { menu: 'إجراءات المادة « {{name}} »', edit: 'تعديل', deactivate: 'تعطيل', activate: 'إعادة التفعيل', delete: 'حذف' },
    empty: { title: 'لا توجد مواد بعد', body: 'أضف أول مادة لبدء تكوين الصيغ.', cta: 'إضافة مادة' },
    inactiveEmpty: { title: 'لا توجد مواد غير نشطة', body: 'المواد التي تعطّلها ستظهر هنا.' },
    form: {
      createTitle: 'مادة جديدة',
      editTitle: 'تعديل المادة',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      code: 'الرمز (اختياري)',
      create: 'إنشاء المادة',
      save: 'حفظ',
      cancel: 'إلغاء',
      createSuccess: 'تم إنشاء المادة',
      editSuccess: 'تم حفظ التعديلات',
    },
    activate: { success: 'تمت إعادة تفعيل المادة' },
    deactivate: { success: 'تم تعطيل المادة' },
    delete: {
      title: 'حذف هذه المادة؟',
      confirm: 'حذف',
      cancel: 'إلغاء',
      success: 'تم حذف المادة',
      blockedTitle: 'تعذّر حذف هذه المادة',
      deactivateInstead: 'تعطيل المادة',
    },
    errors: {
      required: 'هذا الحقل مطلوب',
      invalidCode: 'رمز غير صالح (أحرف كبيرة وأرقام و- و_ فقط)',
      duplicateCode: 'هذا الرمز مستخدم بالفعل من طرف مادة أخرى',
    },
  },
};

/** Resolve the row-menu aria-label for a subject named `name` (fills `{{name}}`). */
export function rowMenuLabel(L: (typeof STR)[Locale], name: string): string {
  return L.row.menu.replace('{{name}}', name);
}

export type SeedSubject = { nameFr: string; nameAr: string; code?: string };
export type CreatedSubject = SeedSubject & { id: string };

export function subjectName(loc: Locale, s: SeedSubject): string {
  return loc === 'ar' ? s.nameAr : s.nameFr;
}

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-subjects-'));
}

export type Launched = { app: ElectronApplication; win: Page };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

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
 * A group that references one of the seeded subjects, used to exercise the
 * delete-block path. `subjectIdx` indexes into the seeded `subjects` array;
 * `level` is the human label the delete-blocked modal must surface.
 */
export type SeedGroup = { subjectIdx: number; level: string; capacity?: number };

/**
 * Launch, clear the first-run + auth gates, and seed reference data through the
 * public bridge:
 *   - the admin (so the shell renders past the auth gate),
 *   - the given subjects (real rows so the CRUD table has data),
 *   - optionally groups referencing a subject (so `inUseCount > 0`
 *     and the delete-blocked modal has a named reference to show).
 *
 * Returns the created subjects (with their real ids) so specs can look them up.
 */
export async function boot(
  locale: Locale,
  opts: { plan?: PlanId; subjects?: readonly SeedSubject[]; groups?: readonly SeedGroup[] } = {},
): Promise<Launched & { subjects: CreatedSubject[] }> {
  const plan = opts.plan ?? 'premium';
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);

  const created = await live.win.evaluate(
    async (payload) => {
      const api = (window as unknown as { api: Bridge }).api;
      const out: { id: string; nameFr: string; nameAr: string }[] = [];
      for (const s of payload.subjects) {
        const res = (await api.invoke('subject.create', {
          name: { fr: s.nameFr, ar: s.nameAr },
          ...(s.code ? { code: s.code } : {}),
        })) as { id: string };
        out.push({ id: res.id, nameFr: s.nameFr, nameAr: s.nameAr });
      }
      if (payload.groups.length > 0) {
        for (const g of payload.groups) {
          await api.invoke('group.create', {
            subjectId: out[g.subjectIdx]!.id,
            teacherId: null,
            level: g.level,
            capacity: g.capacity ?? 20,
            kind: 'regular',
          });
        }
      }
      return out;
    },
    { subjects: opts.subjects ?? [], groups: opts.groups ?? [] },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  const subjects: CreatedSubject[] = created.map((c, i) => ({
    id: c.id,
    nameFr: c.nameFr,
    nameAr: c.nameAr,
    ...(opts.subjects?.[i]?.code ? { code: opts.subjects[i]!.code } : {}),
  }));
  return { ...live, subjects };
}

/** Navigate to the Subjects list via the sidebar. */
export async function gotoSubjects(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navSubjects, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

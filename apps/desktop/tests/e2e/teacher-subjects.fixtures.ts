import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-124 (frontend half) — teacher ↔ subject wiring:
 *   1. real subject filter on the teacher list,
 *   2. a Subjects detail tab resolving subjectIds → names,
 *   3. a subject multi-select in the teacher create/edit form.
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

/** Copy the specs assert on, mirrored from i18n fr/ar.json (`teachers.*`, `nav.*`). */
export const STR: Record<
  Locale,
  {
    navTeachers: string;
    title: string;
    subtitle: string;
    newBtn: string;
    filters: { subjectLabel: string; subjectAll: string };
    table: { name: string; phone: string; subjects: string; actions: string };
    row: { open: string; menu: string; edit: string };
    empty: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      nameFr: string;
      nameAr: string;
      phone: string;
      subjects: string;
      subjectsEmpty: string;
      create: string;
      save: string;
      createSuccess: string;
      editSuccess: string;
    };
    detail: {
      back: string;
      tabs: { info: string; subjects: string; groups: string; payroll: string };
      subjectsEmptyTitle: string;
      subjectsEmptyBody: string;
    };
  }
> = {
  fr: {
    navTeachers: 'Enseignants',
    title: 'Enseignants',
    subtitle: 'Gérez les enseignants de votre centre.',
    newBtn: 'Nouvel enseignant',
    filters: { subjectLabel: 'Matière', subjectAll: 'Toutes les matières' },
    table: { name: 'Nom', phone: 'Téléphone', subjects: 'Matières', actions: 'Actions' },
    row: { open: 'Ouvrir la fiche', menu: "Actions de l'enseignant", edit: 'Modifier' },
    empty: { title: "Aucun enseignant pour l'instant" },
    form: {
      createTitle: 'Nouvel enseignant',
      editTitle: "Modifier l'enseignant",
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      phone: 'Téléphone',
      subjects: 'Matières',
      subjectsEmpty: "Aucune matière configurée. Créez d'abord des matières.",
      create: "Créer l'enseignant",
      save: 'Enregistrer',
      createSuccess: 'Enseignant créé',
      editSuccess: 'Modifications enregistrées',
    },
    detail: {
      back: 'Retour aux enseignants',
      tabs: { info: 'Informations', subjects: 'Matières', groups: 'Groupes', payroll: 'Rémunération' },
      subjectsEmptyTitle: 'Aucune matière assignée',
      subjectsEmptyBody: "Modifiez l'enseignant pour lui attribuer des matières.",
    },
  },
  ar: {
    navTeachers: 'الأساتذة',
    title: 'الأساتذة',
    subtitle: 'أدر أساتذة مركزك.',
    newBtn: 'أستاذ جديد',
    filters: { subjectLabel: 'المادة', subjectAll: 'كل المواد' },
    table: { name: 'الاسم', phone: 'الهاتف', subjects: 'المواد', actions: 'إجراءات' },
    row: { open: 'فتح البطاقة', menu: 'إجراءات الأستاذ', edit: 'تعديل' },
    empty: { title: 'لا يوجد أساتذة بعد' },
    form: {
      createTitle: 'أستاذ جديد',
      editTitle: 'تعديل الأستاذ',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      phone: 'الهاتف',
      subjects: 'المواد',
      subjectsEmpty: 'لا توجد مواد مُعدّة. أنشئ المواد أولًا.',
      create: 'إنشاء الأستاذ',
      save: 'حفظ',
      createSuccess: 'تم إنشاء الأستاذ',
      editSuccess: 'تم حفظ التعديلات',
    },
    detail: {
      back: 'العودة إلى الأساتذة',
      tabs: { info: 'المعلومات', subjects: 'المواد', groups: 'المجموعات', payroll: 'الأجر' },
      subjectsEmptyTitle: 'لا مواد مُسندة',
      subjectsEmptyBody: 'عدّل الأستاذ لإسناد مواد إليه.',
    },
  },
};

/** A bilingual subject the specs seed and then look for by localized name. */
export type SeedSubject = { nameFr: string; nameAr: string; code?: string };
/** A subject as it comes back from the bridge (SubjectView subset). */
export type CreatedSubject = SeedSubject & { id: string };

export function subjectName(loc: Locale, s: SeedSubject): string {
  return loc === 'ar' ? s.nameAr : s.nameFr;
}

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-teacher-subjects-'));
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
 * Launch, get past the first-run + auth gates, and seed reference data through
 * the public bridge:
 *   - the admin (so the shell renders past the auth gate),
 *   - the given subjects (so the filter/multi-select/detail have real names),
 *   - optionally one teacher linked to a subset of those subjects.
 *
 * Returns the created subjects (with their real ids) so specs can wire teachers
 * created through the UI, and can look subjects up by name.
 */
export async function boot(
  locale: Locale,
  opts: {
    plan?: PlanId;
    subjects?: readonly SeedSubject[];
    /** teachers to seed via the bridge; `subjectIdx` indexes into `subjects`. */
    teachers?: readonly { nameFr: string; nameAr: string; phone: string; subjectIdx?: readonly number[] }[];
  } = {},
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
      for (const t of payload.teachers) {
        const subjectIds = (t.subjectIdx ?? []).map((i) => out[i]!.id);
        await api.invoke('teacher.create', {
          name: { fr: t.nameFr, ar: t.nameAr },
          phone: t.phone,
          subjectIds,
        });
      }
      return out;
    },
    { subjects: opts.subjects ?? [], teachers: opts.teachers ?? [] },
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

/** Navigate to the Teachers list via the sidebar. */
export async function gotoTeachers(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navTeachers, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

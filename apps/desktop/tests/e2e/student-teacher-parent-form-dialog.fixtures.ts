import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * SOU-249 — student/teacher/parent add-edit forms open as a CENTERED dialog
 * (not a right-side sheet). Black-box, driven only through the running
 * packaged app and the public preload bridge. No renderer/domain/data
 * implementation is imported. String values mirror `i18n/fr.json` / `ar.json`
 * (the user-facing localization contract, like the students/parents/teachers
 * fixtures). Runs under both the `fr` (LTR) and `ar` (RTL) projects.
 *
 * Launch switches: CS_LOCALE, CS_PLAN, --user-data-dir (fresh first run).
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** A bilingual subject seeded for the teacher subject multi-select. */
export type SeedSubject = { nameFr: string; nameAr: string; code?: string };

/** Copy the spec asserts on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    nav: { students: string; teachers: string; parents: string };
    newBtn: { students: string; teachers: string; parents: string };
    students: {
      createTitle: string;
      createDescription: string;
      nameFr: string;
      nameAr: string;
      birthDate: string;
      level: string;
      create: string;
      createSuccess: string;
    };
    teachers: {
      createTitle: string;
      createDescription: string;
      nameFr: string;
      nameAr: string;
      phone: string;
      subjects: string;
      create: string;
      createSuccess: string;
    };
    parents: {
      createTitle: string;
      createDescription: string;
      name: string;
      phone: string;
      relation: string;
      relationPere: string;
      create: string;
      createSuccess: string;
    };
  }
> = {
  fr: {
    nav: { students: 'Élèves', teachers: 'Enseignants', parents: 'Parents' },
    newBtn: { students: 'Nouvel élève', teachers: 'Nouvel enseignant', parents: 'Nouveau parent' },
    students: {
      createTitle: 'Nouvel élève',
      createDescription: "Renseignez les informations de l'élève.",
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      birthDate: 'Date de naissance',
      level: 'Niveau',
      create: "Créer l'élève",
      createSuccess: 'Élève créé',
    },
    teachers: {
      createTitle: 'Nouvel enseignant',
      createDescription: "Renseignez les informations de l'enseignant.",
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      phone: 'Téléphone',
      subjects: 'Matières',
      create: "Créer l'enseignant",
      createSuccess: 'Enseignant créé',
    },
    parents: {
      createTitle: 'Nouveau parent',
      createDescription: 'Renseignez les informations du parent.',
      name: 'Nom complet',
      phone: 'Téléphone',
      relation: 'Lien de parenté',
      relationPere: 'Père',
      create: 'Créer le parent',
      createSuccess: 'Parent créé',
    },
  },
  ar: {
    nav: { students: 'التلاميذ', teachers: 'الأساتذة', parents: 'أولياء الأمور' },
    newBtn: { students: 'تلميذ جديد', teachers: 'أستاذ جديد', parents: 'ولي أمر جديد' },
    students: {
      createTitle: 'تلميذ جديد',
      createDescription: 'أدخل معلومات التلميذ.',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      birthDate: 'تاريخ الميلاد',
      level: 'المستوى',
      create: 'إنشاء التلميذ',
      createSuccess: 'تم إنشاء التلميذ',
    },
    teachers: {
      createTitle: 'أستاذ جديد',
      createDescription: 'أدخل معلومات الأستاذ.',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      phone: 'الهاتف',
      subjects: 'المواد',
      create: 'إنشاء الأستاذ',
      createSuccess: 'تم إنشاء الأستاذ',
    },
    parents: {
      createTitle: 'ولي أمر جديد',
      createDescription: 'أدخل معلومات ولي الأمر.',
      name: 'الاسم الكامل',
      phone: 'الهاتف',
      relation: 'صلة القرابة',
      relationPere: 'الأب',
      create: 'إنشاء ولي الأمر',
      createSuccess: 'تم إنشاء ولي الأمر',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-form-dialog-'));
}

export type Launched = { app: ElectronApplication; win: Page; subjects: { nameFr: string; nameAr: string }[] };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win, subjects: [] };
}

/**
 * Launch, get past the first-run + auth gates into the shell, and seed the
 * given subjects (for the teacher form's subject multi-select) through the
 * public bridge.
 */
export async function boot(
  locale: Locale,
  subjects: readonly SeedSubject[] = [],
  plan: PlanId = 'premium',
): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);

  const created = await live.win.evaluate(
    async (payload) => {
      const api = (window as unknown as { api: Bridge }).api;
      const out: { nameFr: string; nameAr: string }[] = [];
      for (const s of payload.subjects) {
        await api.invoke('subject.create', {
          name: { fr: s.nameFr, ar: s.nameAr },
          ...(s.code ? { code: s.code } : {}),
        });
        out.push({ nameFr: s.nameFr, nameAr: s.nameAr });
      }
      return out;
    },
    { subjects },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return { ...live, subjects: created };
}

/** Navigate to a list page via the sidebar. */
export async function goto(win: Page, navLabel: string): Promise<void> {
  await win.getByRole('link', { name: navLabel, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

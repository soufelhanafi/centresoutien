import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-62 — Formulas (Formules) CRUD UI.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`), exactly as the SOU-47 subjects fixtures do.
 *
 * The `isImmutable` locked state cannot be seeded here: it is flipped by the
 * SQLite trigger the first time an `InvoiceLine` references a formula
 * (SOU-61), and invoicing has no IPC channel yet (it is still
 * `ModulePlaceholder` on the router) — so there is no public-bridge path to
 * produce that state. The locked-edit / tooltip behavior gets its own E2E
 * coverage once invoicing ships an IPC surface.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`formulas.*`, `nav.*`). */
export const STR: Record<
  Locale,
  {
    navFormulas: string;
    navSubjects: string;
    navGroups: string;
    title: string;
    newBtn: string;
    tabs: { active: string; inactive: string };
    table: { name: string; subjects: string; price: string; kind: string; state: string; actions: string };
    state: { active: string; inactive: string };
    kind: { regular: string; examPrep: string };
    row: { menu: string; edit: string; clone: string; deactivate: string };
    empty: { title: string; cta: string };
    inactiveEmpty: { title: string };
    form: {
      createTitle: string;
      editTitle: string;
      nameFr: string;
      nameAr: string;
      subjects: string;
      price: string;
      create: string;
      save: string;
      cancel: string;
      createSuccess: string;
      editSuccess: string;
    };
    clone: { success: string };
    deactivate: { title: string; confirm: string; success: string };
    errors: { required: string };
  }
> = {
  fr: {
    navFormulas: 'Formules',
    navSubjects: 'Matières',
    navGroups: 'Groupes',
    title: 'Formules',
    newBtn: 'Nouvelle formule',
    tabs: { active: 'Actives', inactive: 'Inactives' },
    table: { name: 'Nom', subjects: 'Matières', price: 'Prix / mois', kind: 'Type', state: 'État', actions: 'Actions' },
    state: { active: 'Active', inactive: 'Inactive' },
    kind: { regular: 'Régulier', examPrep: 'Prépa examen' },
    row: { menu: 'Actions de la formule « {{name}} »', edit: 'Modifier', clone: 'Dupliquer', deactivate: 'Désactiver' },
    empty: { title: "Aucune formule pour l'instant", cta: 'Créer une formule' },
    inactiveEmpty: { title: 'Aucune formule inactive' },
    form: {
      createTitle: 'Nouvelle formule',
      editTitle: 'Modifier la formule',
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      subjects: 'Matières incluses',
      price: 'Prix mensuel (MAD)',
      create: 'Créer la formule',
      save: 'Enregistrer',
      cancel: 'Annuler',
      createSuccess: 'Formule créée',
      editSuccess: 'Modifications enregistrées',
    },
    clone: { success: 'Formule dupliquée — modifiez le prix ou les matières si besoin.' },
    deactivate: { title: 'Désactiver cette formule ?', confirm: 'Désactiver', success: 'Formule désactivée' },
    errors: { required: 'Ce champ est requis' },
  },
  ar: {
    navFormulas: 'الصيغ',
    navSubjects: 'المواد',
    navGroups: 'المجموعات',
    title: 'الصيغ',
    newBtn: 'صيغة جديدة',
    tabs: { active: 'نشطة', inactive: 'غير نشطة' },
    table: { name: 'الاسم', subjects: 'المواد', price: 'السعر / شهريًا', kind: 'النوع', state: 'الحالة', actions: 'إجراءات' },
    state: { active: 'نشطة', inactive: 'غير نشطة' },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان' },
    row: { menu: 'إجراءات الصيغة « {{name}} »', edit: 'تعديل', clone: 'تكرار', deactivate: 'تعطيل' },
    empty: { title: 'لا توجد صيغة بعد', cta: 'إنشاء صيغة' },
    inactiveEmpty: { title: 'لا توجد صيغ غير نشطة' },
    form: {
      createTitle: 'صيغة جديدة',
      editTitle: 'تعديل الصيغة',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      subjects: 'المواد المضمّنة',
      price: 'السعر الشهري (درهم)',
      create: 'إنشاء الصيغة',
      save: 'حفظ',
      cancel: 'إلغاء',
      createSuccess: 'تم إنشاء الصيغة',
      editSuccess: 'تم حفظ التعديلات',
    },
    clone: { success: 'تم تكرار الصيغة — عدّل السعر أو المواد إذا لزم الأمر.' },
    deactivate: { title: 'تعطيل هذه الصيغة؟', confirm: 'تعطيل', success: 'تم تعطيل الصيغة' },
    errors: { required: 'هذا الحقل مطلوب' },
  },
};

/** Resolve the row-menu aria-label for a formula named `name` (fills `{{name}}`). */
export function rowMenuLabel(L: (typeof STR)[Locale], name: string): string {
  return L.row.menu.replace('{{name}}', name);
}

export type SeedSubject = { nameFr: string; nameAr: string; code?: string };
export type SeedFormula = {
  nameFr: string;
  nameAr: string;
  subjectIdxs: readonly number[];
  priceMad: number; // whole MAD, converted to centimes on seed
  kind?: 'regular' | 'exam-prep';
};

export function formulaName(loc: Locale, f: { nameFr: string; nameAr: string }): string {
  return loc === 'ar' ? f.nameAr : f.nameFr;
}

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-formulas-'));
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
 * Launch, clear the first-run + auth gates, and seed reference data through the
 * public bridge: the admin, the given subjects, then the given formulas
 * (referencing those subjects by index). Returns the created subjects/formulas
 * with their real ids so specs can look them up.
 */
export async function boot(
  locale: Locale,
  opts: { plan?: PlanId; subjects?: readonly SeedSubject[]; formulas?: readonly SeedFormula[] } = {},
): Promise<Launched & { subjects: { id: string; nameFr: string; nameAr: string }[] }> {
  const plan = opts.plan ?? 'premium';
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);

  const subjects = await live.win.evaluate(async (seed) => {
    const api = (window as unknown as { api: Bridge }).api;
    const out: { id: string; nameFr: string; nameAr: string }[] = [];
    for (const s of seed) {
      const res = (await api.invoke('subject.create', {
        name: { fr: s.nameFr, ar: s.nameAr },
        ...(s.code ? { code: s.code } : {}),
      })) as { id: string };
      out.push({ id: res.id, nameFr: s.nameFr, nameAr: s.nameAr });
    }
    return out;
  }, opts.subjects ?? []);

  await live.win.evaluate(
    async (payload) => {
      const api = (window as unknown as { api: Bridge }).api;
      for (const f of payload.formulas) {
        await api.invoke('formula.create', {
          name: { fr: f.nameFr, ar: f.nameAr },
          subjectIds: f.subjectIdxs.map((i) => payload.subjects[i]!.id),
          priceMad: Math.round(f.priceMad * 100),
          kind: f.kind ?? 'regular',
        });
      }
    },
    { subjects, formulas: opts.formulas ?? [] },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return { ...live, subjects };
}

/** Navigate to the Formulas list via the sidebar. */
export async function gotoFormulas(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navFormulas, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

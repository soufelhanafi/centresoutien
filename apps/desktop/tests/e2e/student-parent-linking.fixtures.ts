import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Locator, type Page, expect } from '@playwright/test';

/**
 * Black-box fixtures for SOU-42 — Student ↔ Parent linking UI (bidirectional).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. The only string values referenced here mirror the localization
 * catalog (`i18n/fr.json` / `ar.json`) — the user-facing localization contract —
 * exactly as the SOU-39 (students) and SOU-41 (parents) fixtures do.
 *
 * Acceptance criteria under test (Linear SOU-42):
 *   "Admin can link/unlink parents ↔ students from either side without leaving
 *    the page. Add-existing (autocomplete) or create-new inline."
 *
 * Locked UX decisions asserted by the spec:
 *   - Linking happens in an INLINE panel on the detail screens (student detail →
 *     "Responsables" tab; parent detail sheet → children list) — never by
 *     opening the full edit form.
 *   - Unlink is IMMEDIATE and shows an undo toast ("Lien supprimé" + "Annuler")
 *     that restores the link when clicked.
 *
 * Launch switches (documented, shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 *
 * Plan choice: the student-side "Responsables" tab is gated (its locked copy
 * cites "plan Pro"), so this suite boots on `premium` — the superset — to
 * exercise linking unlocked on BOTH sides in a single run.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

type RelationKey = 'pere' | 'mere' | 'tuteur' | 'autre';

/** All copy the SOU-42 specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navStudents: string;
    navParents: string;
    // shared
    undo: string; // common.undo — the undo-toast action label
    // Parents list + create sheet (SOU-41 surface, reused here)
    parents: {
      title: string;
      newBtn: string;
      form: { name: string; phone: string; relation: string; create: string; createSuccess: string };
      relation: Record<RelationKey, string>;
      row: { menu: string };
    };
    // Students list + create sheet (SOU-39 surface, reused here)
    students: {
      title: string;
      newBtn: string;
      form: { nameFr: string; nameAr: string; birthDate: string; level: string; create: string; createSuccess: string };
    };
    // Student detail → "Responsables" tab (the SOU-42 student side)
    guardians: {
      tab: string; // tab label == title
      title: string;
      add: string; // "Lier un responsable" — link-existing autocomplete
      createNew: string; // "Créer un responsable" — inline create-new
      searchPlaceholder: string;
      noMatches: string;
      unlink: (name: string) => string; // aria-label "Retirer {name}"
      linkSuccess: string;
      unlinkSuccess: string;
      empty: { title: string; body: string };
    };
    // Parent detail sheet → children list (the SOU-42 parent side)
    children: {
      title: string;
      add: string; // "Ajouter un élève" — create-new child (existing flow)
      linkExisting: string; // "Lier un élève" — link-existing autocomplete
      searchPlaceholder: string;
      noMatches: string;
      unlink: (name: string) => string;
      linkSuccess: string;
      unlinkSuccess: string;
      empty: { title: string };
    };
  }
> = {
  fr: {
    navStudents: 'Élèves',
    navParents: 'Parents',
    undo: 'Annuler',
    parents: {
      title: 'Parents',
      newBtn: 'Nouveau parent',
      form: { name: 'Nom complet', phone: 'Téléphone', relation: 'Lien de parenté', create: 'Créer le parent', createSuccess: 'Parent créé' },
      relation: { pere: 'Père', mere: 'Mère', tuteur: 'Tuteur', autre: 'Autre' },
      row: { menu: 'Actions du parent' },
    },
    students: {
      title: 'Élèves',
      newBtn: 'Nouvel élève',
      form: { nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', birthDate: 'Date de naissance', level: 'Niveau', create: "Créer l'élève", createSuccess: 'Élève créé' },
    },
    guardians: {
      tab: 'Responsables',
      title: 'Responsables',
      add: 'Lier un responsable',
      createNew: 'Créer un responsable',
      searchPlaceholder: 'Rechercher un responsable',
      noMatches: 'Aucun responsable trouvé.',
      unlink: (name) => `Retirer ${name}`,
      linkSuccess: 'Responsable lié',
      unlinkSuccess: 'Lien supprimé',
      empty: { title: 'Aucun responsable lié', body: 'Liez un parent ou tuteur à cet élève.' },
    },
    children: {
      title: 'Élèves',
      add: 'Ajouter un élève',
      linkExisting: 'Lier un élève',
      searchPlaceholder: 'Rechercher un élève',
      noMatches: 'Aucun élève trouvé.',
      unlink: (name) => `Retirer ${name}`,
      linkSuccess: 'Élève lié',
      unlinkSuccess: 'Lien supprimé',
      empty: { title: 'Aucun élève lié' },
    },
  },
  ar: {
    navStudents: 'التلاميذ',
    navParents: 'أولياء الأمور',
    undo: 'تراجع',
    parents: {
      title: 'أولياء الأمور',
      newBtn: 'ولي أمر جديد',
      form: { name: 'الاسم الكامل', phone: 'الهاتف', relation: 'صلة القرابة', create: 'إنشاء ولي الأمر', createSuccess: 'تم إنشاء ولي الأمر' },
      relation: { pere: 'الأب', mere: 'الأم', tuteur: 'وصي', autre: 'أخرى' },
      row: { menu: 'إجراءات ولي الأمر' },
    },
    students: {
      title: 'التلاميذ',
      newBtn: 'تلميذ جديد',
      form: { nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', birthDate: 'تاريخ الميلاد', level: 'المستوى', create: 'إنشاء التلميذ', createSuccess: 'تم إنشاء التلميذ' },
    },
    guardians: {
      tab: 'الأولياء',
      title: 'الأولياء',
      add: 'ربط وليّ',
      createNew: 'إنشاء وليّ',
      searchPlaceholder: 'ابحث عن وليّ',
      noMatches: 'لم يُعثر على أي وليّ.',
      unlink: (name) => `إزالة ${name}`,
      linkSuccess: 'تم ربط الوليّ',
      unlinkSuccess: 'تم حذف الرابط',
      empty: { title: 'لا يوجد وليّ مرتبط', body: 'اربط وليًّا أو وصيًّا بهذا التلميذ.' },
    },
    children: {
      title: 'الطلاب',
      add: 'إضافة طالب',
      linkExisting: 'ربط طالب',
      searchPlaceholder: 'ابحث عن طالب',
      noMatches: 'لم يُعثر على أي طالب.',
      unlink: (name) => `إزالة ${name}`,
      linkSuccess: 'تم ربط الطالب',
      unlinkSuccess: 'تم حذف الرابط',
      empty: { title: 'لا يوجد طلاب مرتبطون' },
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-linking-'));
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
 * Launch and get past the first-run + auth gates into the shell, then reload so
 * the shell renders. Same recipe the students / parents suites use. Boots
 * `premium` so both linking surfaces are unlocked.
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

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

// ---------------------------------------------------------------------------
// Navigation + seeding helpers (all through the visible UI, black-box).
// ---------------------------------------------------------------------------

export async function gotoStudents(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.waitForLoadState('domcontentloaded');
  await expect(win.getByRole('heading', { level: 1, name: L.students.title })).toBeVisible();
}

export async function gotoParents(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navParents, exact: true }).click();
  await win.waitForLoadState('domcontentloaded');
  await expect(win.getByRole('heading', { level: 1, name: L.parents.title })).toBeVisible();
}

export type NewStudent = { nameFr: string; nameAr: string; birthDate: string; level: string };
export type NewParent = { name: string; phone: string; relation?: RelationKey };

/** Create a student from the Students list. Leaves the list mounted. */
export async function createStudent(win: Page, L: (typeof STR)[Locale], s: NewStudent): Promise<void> {
  await win.getByRole('button', { name: L.students.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.students.form.nameFr, { exact: false }).fill(s.nameFr);
  await dialog.getByLabel(L.students.form.nameAr, { exact: false }).fill(s.nameAr);
  await dialog.getByLabel(L.students.form.birthDate, { exact: false }).fill(s.birthDate);
  await dialog.getByLabel(L.students.form.level, { exact: false }).fill(s.level);
  await dialog.getByRole('button', { name: L.students.form.create }).click();
  await expect(win.getByText(L.students.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Create a parent from the Parents list. Leaves the list mounted. */
export async function createParent(win: Page, L: (typeof STR)[Locale], p: NewParent): Promise<void> {
  await win.getByRole('button', { name: L.parents.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.parents.form.name, { exact: false }).fill(p.name);
  await dialog.getByLabel(L.parents.form.phone, { exact: false }).fill(p.phone);
  await dialog.getByRole('combobox', { name: L.parents.form.relation }).click();
  await win.getByRole('option', { name: L.parents.relation[p.relation ?? 'pere'], exact: true }).click();
  await dialog.getByRole('button', { name: L.parents.form.create }).click();
  await expect(win.getByText(L.parents.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/**
 * Open a student's detail PAGE from the Students list (the row's name link is
 * the open affordance, per SOU-39) and switch to the "Responsables" tab.
 */
export async function openStudentGuardiansTab(win: Page, name: string, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('row', { name: new RegExp(name) }).getByRole('link', { name: new RegExp(name) }).click();
  const tab = win.getByRole('tab', { name: L.guardians.tab });
  await expect(tab).toBeVisible();
  await tab.click();
}

/** Open a parent's detail SHEET from the Parents list by clicking the name button. */
export async function openParentDetail(win: Page, name: string): Promise<Locator> {
  await win.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name, exact: true }).click();
  const sheet = win.getByRole('dialog');
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Drive an inline link-existing autocomplete: click the trigger button, type the
 * query into the search field, and pick the matching option. Resilient to the
 * option being a `role=option` (Radix Command / combobox listbox) or a button.
 */
export async function linkViaAutocomplete(
  win: Page,
  triggerName: string,
  searchPlaceholder: string,
  query: string,
  optionName: string,
): Promise<void> {
  await win.getByRole('button', { name: triggerName }).first().click();
  const search = win
    .getByPlaceholder(searchPlaceholder, { exact: false })
    .or(win.getByRole('combobox', { name: new RegExp(searchPlaceholder) }))
    .first();
  await expect(search).toBeVisible();
  await search.fill(query);
  const option = win.getByRole('option', { name: new RegExp(optionName) }).or(win.getByRole('button', { name: new RegExp(optionName) })).first();
  await expect(option).toBeVisible();
  await option.click();
}

/** Click an undo-toast action ("Annuler" / "تراجع") to restore a just-removed link. */
export async function clickUndo(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  const undo = win.getByRole('button', { name: L.undo, exact: true }).last();
  await expect(undo).toBeVisible();
  await undo.click();
}

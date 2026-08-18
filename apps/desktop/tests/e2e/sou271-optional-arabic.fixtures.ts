import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, test, type ElectronApplication, type Page } from '@playwright/test';

/**
 * SOU-271 — Make all Arabic name fields optional across entities (FR-only data
 * entry). Black-box, driven only through the running packaged app and the
 * public preload bridge (`window.api.invoke`). No renderer/domain/data
 * implementation is imported. Every string asserted mirrors the localization
 * catalog (`i18n/fr.json` / `ar.json`) — the user-facing contract, exactly as
 * the SOU-47 / SOU-39 / SOU-62 / SOU-30 fixtures do.
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const STR = {
  fr: {
    nav: { subjects: 'Matières', formulas: 'Formules', students: 'Élèves', teachers: 'Enseignants', niveaux: 'Niveaux', settings: 'Paramètres', invoicing: 'Facturation' },
    common: { required: 'Ce champ est requis', cancel: 'Annuler' },
    subject: { title: 'Matières', newBtn: 'Nouvelle matière', nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', code: 'Code (optionnel)', create: 'Créer la matière', edit: 'Modifier', save: 'Enregistrer', createSuccess: 'Matière créée', editSuccess: 'Modifications enregistrées', rowMenu: 'Actions de la matière « {{name}} »' },
    student: { title: 'Élèves', newBtn: 'Nouvel élève', nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', birthDate: 'Date de naissance', level: 'Niveau', create: "Créer l'élève", save: 'Enregistrer', createSuccess: 'Élève créé', editSuccess: 'Modifications enregistrées', rowMenu: "Actions de l'élève", edit: 'Modifier' },
    teacher: { title: 'Enseignants', newBtn: 'Nouvel enseignant', nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', phone: 'Téléphone', create: "Créer l'enseignant", createSuccess: 'Enseignant créé' },
    niveau: { title: 'Niveaux', newBtn: 'Ajouter un niveau', nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', category: 'Catégorie', categoryPlaceholder: 'Sélectionner une catégorie', categoryCollege: 'Collège', create: 'Créer le niveau', createSuccess: 'Niveau créé' },
    holiday: { tab: 'Vacances', sectionTitle: 'Jours fériés et vacances', newBtn: 'Nouveau jour férié', createTitle: 'Nouveau jour férié', create: 'Créer', createdToast: 'Jour férié créé' },
    formula: { title: 'Formules', newBtn: 'Nouvelle formule', nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', subjects: 'Matières incluses', price: 'Prix mensuel (MAD)', create: 'Créer la formule', createSuccess: 'Formule créée' },
    invoice: { title: 'Factures', emptyTitle: 'Aucune facture', back: 'Retour aux factures' },
  },
  ar: {
    nav: { subjects: 'المواد', formulas: 'الصيغ', students: 'التلاميذ', teachers: 'الأساتذة', niveaux: 'المستويات', settings: 'الإعدادات', invoicing: 'الفوترة' },
    common: { required: 'هذا الحقل مطلوب', cancel: 'إلغاء' },
    subject: { title: 'المواد', newBtn: 'مادة جديدة', nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', code: 'الرمز (اختياري)', create: 'إنشاء المادة', edit: 'تعديل', save: 'حفظ', createSuccess: 'تم إنشاء المادة', editSuccess: 'تم حفظ التعديلات', rowMenu: 'إجراءات المادة « {{name}} »' },
    student: { title: 'التلاميذ', newBtn: 'تلميذ جديد', nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', birthDate: 'تاريخ الميلاد', level: 'المستوى', create: 'إنشاء التلميذ', save: 'حفظ', createSuccess: 'تم إنشاء التلميذ', editSuccess: 'تم حفظ التعديلات', rowMenu: 'إجراءات التلميذ', edit: 'تعديل' },
    teacher: { title: 'الأساتذة', newBtn: 'أستاذ جديد', nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', phone: 'الهاتف', create: 'إنشاء الأستاذ', createSuccess: 'تم إنشاء الأستاذ' },
    niveau: { title: 'المستويات', newBtn: 'إضافة مستوى', nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', category: 'الفئة', categoryPlaceholder: 'اختر فئة', categoryCollege: 'الإعدادي', create: 'إنشاء المستوى', createSuccess: 'تم إنشاء المستوى' },
    holiday: { tab: 'العطل', sectionTitle: 'أيام العطل والإجازات', newBtn: 'عطلة جديدة', createTitle: 'عطلة جديدة', create: 'إنشاء', createdToast: 'تم إنشاء العطلة' },
    formula: { title: 'الصيغ', newBtn: 'صيغة جديدة', nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', subjects: 'المواد المضمّنة', price: 'السعر الشهري (درهم)', create: 'إنشاء الصيغة', createSuccess: 'تم إنشاء الصيغة' },
    invoice: { title: 'الفواتير', emptyTitle: 'لا توجد فواتير', back: 'العودة إلى الفواتير' },
  },
} as const;

export type Str = (typeof STR)[Locale];

export function rowMenuLabel(template: string, name: string): string {
  return template.replace('{{name}}', name);
}

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou271-'));
}

export type Launched = { app: ElectronApplication; win: Page };
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: plan };
  delete env['CS_E2E_OMIT_FEATURES'];
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Boot past the first-run + auth gates into the shell. Runs `center.save` so the
 * default niveau catalog seeds (the student form's level picker needs options),
 * exactly as the real first-run wizard does.
 */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
    await api.invoke('center.save', { name: 'Centre de Soutien', address: '', phone: '', email: '', logoPath: null });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/** Seed a subject through the public bridge; `nameAr` may be '' to exercise the blank-Arabic path. */
export async function seedSubject(win: Page, s: { nameFr: string; nameAr: string; code?: string }): Promise<string> {
  return win.evaluate(async (subject) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('subject.create', {
      name: { fr: subject.nameFr, ar: subject.nameAr },
      ...(subject.code ? { code: subject.code } : {}),
    })) as { id: string };
    return res.id;
  }, s);
}

/** Seed a student through the public bridge; `nameAr` may be ''. */
export async function seedStudent(win: Page, s: { nameFr: string; nameAr: string; level: string; birthDate?: string }): Promise<string> {
  return win.evaluate(async (student) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('student.create', {
      name: { fr: student.nameFr, ar: student.nameAr },
      birthDate: student.birthDate ?? '2010-05-14',
      level: student.level,
    })) as { id: string };
    return res.id;
  }, s);
}

export type SeededBlankArInvoice = { studentId: string; invoiceId: string; studentNameFr: string; formulaNameFr: string; priceMad: number };

/**
 * Seed a subject + a Formula whose Arabic name is BLANK + a student + an active
 * regular subscription, then run monthly generation. Returns the drafted
 * invoice id (resolved via `invoice.list` filtered by student — the only public
 * path to a fresh invoice id). Exercises AC6 end to end through the bridge.
 */
export async function seedBlankArInvoice(win: Page, opts: { month: string; priceMad: number }): Promise<SeededBlankArInvoice> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: '' } })) as { id: string };
    const formula = (await api.invoke('formula.create', {
      name: { fr: 'Maths seul', ar: '' },
      subjectIds: [subject.id],
      priceMad: Math.round(o.priceMad * 100),
      kind: 'regular',
    })) as { id: string };
    const student = (await api.invoke('student.create', {
      name: { fr: 'Salma Bennani', ar: '' },
      birthDate: '2010-05-14',
      level: '3AC',
    })) as { id: string };
    await api.invoke('subscription.create', {
      studentId: student.id,
      formulaId: formula.id,
      kind: 'regular',
      subjectIds: [subject.id],
      startMonth: o.month,
    });
    await api.invoke('invoice.generateMonthly', { month: o.month });
    const list = (await api.invoke('invoice.list', { studentId: student.id })) as { invoices: { id: string }[] };
    const invoice = list.invoices[0];
    if (!invoice) throw new Error('seedBlankArInvoice: no invoice drafted by invoice.generateMonthly');
    return { studentId: student.id, invoiceId: invoice.id, studentNameFr: 'Salma Bennani', formulaNameFr: 'Maths seul', priceMad: o.priceMad };
  }, opts);
}

/** Navigate to a top-level list page via the sidebar link. */
export async function gotoNav(win: Page, navLabel: string): Promise<void> {
  await win.getByRole('link', { name: navLabel, exact: true }).click();
  await win.waitForTimeout(400);
}

/** Open Settings and switch to the Holidays tab. */
export async function gotoHolidays(win: Page, L: Str): Promise<void> {
  await win.getByRole('link', { name: L.nav.settings, exact: true }).click();
  await win.getByRole('tab', { name: L.holiday.tab }).click();
  await win.getByRole('heading', { name: L.holiday.sectionTitle }).scrollIntoViewIfNeeded();
  await win.waitForTimeout(300);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

/** True when the literal token "undefined"/"null"/"NaN" leaked into the visible text of `region`. */
export async function hasLeakedNullish(win: Page, selector = 'body'): Promise<boolean> {
  return win.evaluate((sel) => {
    const el = document.querySelector(sel);
    const text = el ? (el as HTMLElement).innerText : '';
    return /\bundefined\b|\bNaN\b|\bnull\b/.test(text);
  }, selector);
}

export function shot(name: string): string {
  return test.info().outputPath(`sou271-${name}-${test.info().project.name}.png`);
}

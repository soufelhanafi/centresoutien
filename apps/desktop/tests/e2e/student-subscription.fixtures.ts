import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-65 — Student detail: subscription state (Active +
 * History) and the close-and-reopen "change subscription" wizard.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing localization contract, exactly
 * as the SOU-39 students / SOU-47 subjects fixtures do.
 *
 * `formula.create` (SOU-62, merged after this branch was cut) now backs a real
 * Settings screen, so `seedFormula` below seeds real formulas through the
 * public bridge — the same seeding-via-bridge pattern the other suites use for
 * prerequisite entities (e.g. `subject.create` / `room.create`). Some
 * scenarios still seed `StudentSubscription` rows directly via
 * `subscription.create` with a syntactically-valid, non-existent `formulaId`
 * (`fakeFormulaId`) to exercise the read side (Active tab, History tab, kind
 * isolation, the at-most-one-active-per-kind domain guard) in isolation from
 * formula resolution.
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

/** All copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navStudents: string;
    detailTabs: { info: string; guardians: string; enrollment: string; invoices: string; attendance: string };
    form: { nameFr: string; nameAr: string; birthDate: string; level: string; create: string };
    kind: { regular: string; examPrep: string };
    active: { changeCta: string; subscribeCta: string; since: string; empty: string };
    history: { heading: string; empty: string; since: string; table: { kind: string; formula: string; period: string } };
    wizard: {
      changeTitle: string;
      changeDescription: string;
      subscribeTitle: string;
      subscribeDescription: string;
      currentFormulaLabel: string;
      endMonthLabel: string;
      formulaLabel: string;
      formulaPlaceholder: string;
      noFormulas: string;
      startMonthLabel: string;
      cancel: string;
      confirm: string;
    };
  }
> = {
  fr: {
    navStudents: 'Élèves',
    detailTabs: { info: 'Informations', guardians: 'Responsables', enrollment: 'Inscriptions', invoices: 'Factures', attendance: 'Présence' },
    form: { nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', birthDate: 'Date de naissance', level: 'Niveau', create: "Créer l'élève" },
    kind: { regular: 'Régulier', examPrep: 'Prépa examen' },
    active: { changeCta: 'Changer de formule', subscribeCta: 'Souscrire', since: 'Depuis {{month}}', empty: 'Aucun abonnement actif.' },
    history: {
      heading: 'Historique',
      empty: "Aucun historique pour l'instant.",
      since: 'À partir de {{month}}',
      table: { kind: 'Type', formula: 'Formule', period: 'Période' },
    },
    wizard: {
      changeTitle: 'Changer de formule',
      changeDescription: "Clôturez l'abonnement actuel, puis choisissez la nouvelle formule.",
      subscribeTitle: 'Nouvel abonnement',
      subscribeDescription: 'Choisissez une formule pour cet élève.',
      currentFormulaLabel: 'Formule actuelle',
      endMonthLabel: 'Mois de fin',
      formulaLabel: 'Nouvelle formule',
      formulaPlaceholder: 'Choisir une formule',
      noFormulas: 'Aucune formule active. Créez-en une dans les paramètres.',
      startMonthLabel: 'Mois de début',
      cancel: 'Annuler',
      confirm: 'Confirmer',
    },
  },
  ar: {
    navStudents: 'التلاميذ',
    detailTabs: { info: 'المعلومات', guardians: 'الأولياء', enrollment: 'التسجيلات', invoices: 'الفواتير', attendance: 'الحضور' },
    form: { nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', birthDate: 'تاريخ الميلاد', level: 'المستوى', create: 'إنشاء التلميذ' },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان' },
    active: { changeCta: 'تغيير الصيغة', subscribeCta: 'الاشتراك', since: 'منذ {{month}}', empty: 'لا يوجد اشتراك نشط.' },
    history: {
      heading: 'السجل',
      empty: 'لا يوجد سجل بعد.',
      since: 'ابتداءً من {{month}}',
      table: { kind: 'النوع', formula: 'الصيغة', period: 'الفترة' },
    },
    wizard: {
      changeTitle: 'تغيير الصيغة',
      changeDescription: 'أنهِ الاشتراك الحالي، ثم اختر الصيغة الجديدة.',
      subscribeTitle: 'اشتراك جديد',
      subscribeDescription: 'اختر صيغة لهذا التلميذ.',
      currentFormulaLabel: 'الصيغة الحالية',
      endMonthLabel: 'شهر الانتهاء',
      formulaLabel: 'الصيغة الجديدة',
      formulaPlaceholder: 'اختر صيغة',
      noFormulas: 'لا توجد صيغة نشطة. أنشئ واحدة من الإعدادات.',
      startMonthLabel: 'شهر البداية',
      cancel: 'إلغاء',
      confirm: 'تأكيد',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-subscription-'));
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

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** Launch, clear the first-run + auth gates through the public bridge (same recipe every other suite uses). */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
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

export type NewStudent = { nameFr: string; nameAr: string; birthDate: string; level: string };

/** Create a student through the real Students UI (list → dialog → submit) and open its detail page. */
export async function createStudentAndOpenDetail(win: Page, L: (typeof STR)[Locale], s: NewStudent): Promise<void> {
  await win.getByRole('link', { name: L.navStudents, exact: true }).click();
  await win.waitForTimeout(300);
  await win.getByRole('button', { name: /Nouvel élève|تلميذ جديد/ }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill(s.nameFr);
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill(s.nameAr);
  await dialog.getByLabel(L.form.birthDate, { exact: false }).fill(s.birthDate);
  await dialog.getByLabel(L.form.level, { exact: false }).fill(s.level);
  await dialog.getByRole('button', { name: L.form.create }).click();
  await win.waitForTimeout(400);
  await win.getByRole('row', { name: new RegExp(s.nameFr) }).getByRole('link', { name: new RegExp(s.nameFr) }).click();
  await win.waitForTimeout(300);
}

/** Open the "Inscriptions" (enrollment/subscription) tab on an already-open student detail page. */
export async function gotoSubscriptionTab(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('tab', { name: L.detailTabs.enrollment }).click();
  await win.waitForTimeout(300);
}

export type SeededSubscription = {
  studentId: string;
  formulaId: string;
  kind: 'regular' | 'exam-prep';
  subjectIds: string[];
  startMonth: string;
};

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, matches ULID's alphabet

/** A syntactically-valid but non-existent 26-char ULID suffix, so `fml_<this>` passes the id-shape check. */
export function fakeFormulaId(): string {
  let suffix = '';
  for (let i = 0; i < 26; i += 1) suffix += ULID_ALPHABET[Math.floor(Math.random() * ULID_ALPHABET.length)];
  return `fml_${suffix}`;
}

/**
 * Seed prerequisite reference data (subject + student) and a StudentSubscription
 * through the public `subscription.create` IPC channel, bypassing the wizard's
 * own formula picker entirely — used by scenarios that only need to exercise
 * the read side (Active/History rendering, kind isolation, the
 * at-most-one-active-per-kind guard). `formulaId` is a syntactically valid but
 * non-existent id; the running app was observed NOT to validate its existence
 * (carry-forward note, filed against SOU-63's backlog).
 */
export async function seedStudentWithSubscription(
  win: Page,
  opts: { nameFr: string; nameAr: string; birthDate: string; level: string; kind: 'regular' | 'exam-prep'; startMonth: string; endMonth?: string | null },
): Promise<{ studentId: string; subjectId: string; formulaId: string; subscriptionId: string }> {
  const formulaId = fakeFormulaId();
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
    const student = (await api.invoke('student.create', {
      name: { fr: o.nameFr, ar: o.nameAr },
      birthDate: o.birthDate,
      level: o.level,
    })) as { id: string };
    const sub = (await api.invoke('subscription.create', {
      studentId: student.id,
      formulaId: o.formulaId,
      kind: o.kind,
      subjectIds: [subject.id],
      startMonth: o.startMonth,
    })) as { id: string };
    if (o.endMonth) {
      await api.invoke('subscription.close', { subscriptionId: sub.id, endMonth: o.endMonth });
    }
    return { studentId: student.id, subjectId: subject.id, formulaId: o.formulaId, subscriptionId: sub.id };
  }, { ...opts, formulaId });
}

/** Attempt a `subscription.create` call and capture the error message (or null on success). */
export async function tryCreateSubscription(
  win: Page,
  payload: { studentId: string; formulaId: string; kind: 'regular' | 'exam-prep'; subjectIds: string[]; startMonth: string },
): Promise<string | null> {
  return win.evaluate(async (p) => {
    const api = (window as unknown as { api: Bridge }).api;
    try {
      await api.invoke('subscription.create', p);
      return null;
    } catch (e) {
      return String((e as { message?: string })?.message ?? e);
    }
  }, payload);
}

export type SeedFormula = { nameFr: string; nameAr: string; priceMad: number; kind?: 'regular' | 'exam-prep' };

/**
 * Seed one subject + one real Formula bundling it, through the public bridge
 * (`subject.create` then `formula.create`, SOU-62). Backs the wizard's own
 * formula picker, unlike {@link seedStudentWithSubscription}'s `fakeFormulaId`.
 */
export async function seedFormula(win: Page, f: SeedFormula): Promise<{ subjectId: string; formulaId: string }> {
  return win.evaluate(async (payload) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
    const formula = (await api.invoke('formula.create', {
      name: { fr: payload.nameFr, ar: payload.nameAr },
      subjectIds: [subject.id],
      priceMad: Math.round(payload.priceMad * 100),
      kind: payload.kind ?? 'regular',
    })) as { id: string };
    return { subjectId: subject.id, formulaId: formula.id };
  }, f);
}

/** The localized name for a seeded formula, mirroring `formulas.fixtures.ts`. */
export function formulaName(loc: Locale, f: { nameFr: string; nameAr: string }): string {
  return loc === 'ar' ? f.nameAr : f.nameFr;
}

/** The current calendar month, `YYYY-MM` — mirrors the wizard's own default. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** The month right before `month` (`YYYY-MM`), rolling over the year boundary. */
export function previousMonth(month: string): string {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  return new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString().slice(0, 7);
}

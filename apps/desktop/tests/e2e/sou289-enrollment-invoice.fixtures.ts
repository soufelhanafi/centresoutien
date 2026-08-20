import { expect, type Page } from '@playwright/test';
import type { STR as SUB_STR} from './student-subscription.fixtures';
import { type Locale } from './student-subscription.fixtures';
import { escapeRegExp } from './invoices.fixtures';

/**
 * Black-box fixtures for SOU-289 — Generate the student's first invoice
 * immediately on enrollment (+ draft-line amount editing).
 *
 * Reuses SOU-65's `student-subscription.fixtures.ts` (boot with the niveau
 * catalog, the real Students UI recipe, `seedFormula`) and SOU-69's
 * `invoices.fixtures.ts` (invoice list/detail copy, `tryInvoke`). This file
 * only adds the copy + helpers specific to SOU-289: the enrollment-invoice
 * outcome toasts, the draft-line edit dialog, and bridge twins for the
 * `subscription.create` response contract (`invoiceOutcome` / `invoiceId`)
 * and the `invoice.updateLineAmount` channel.
 *
 * Every string mirrored below comes from `i18n/fr.json` / `ar.json`
 * (`students.subscription.wizard.toast.invoice`-family and
 * `invoices.detail.lineEdit` namespaces) — the user-facing localization
 * contract, not implementation.
 */

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** The one student every SOU-289 scenario enrolls. */
export const YASSINE = { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' } as const;
export const REGULAR_FORMULA = { nameFr: 'Maths seul', nameAr: 'الرياضيات فقط', priceMad: 200, kind: 'regular' } as const;
export const EXAM_FORMULA = { nameFr: 'Préparation Bac Math', nameAr: 'تحضير باك رياضيات', priceMad: 800, kind: 'exam-prep' } as const;

/**
 * Subscribe via the enrollment tab's wizard. The regular card renders before
 * the exam-prep card, and a card that already has an active subscription stops
 * offering "Souscrire" — so `first()` always hits the regular card on a fresh
 * student, and `last()` always hits the exam-prep card whether or not the
 * regular card still offers the CTA.
 */
export async function subscribeViaWizard(
  win: Page,
  L: (typeof SUB_STR)[Locale],
  opts: { formulaLabel: string; card: 'regular' | 'exam-prep'; startMonth?: string },
): Promise<void> {
  const subscribeButtons = win.getByRole('button', { name: L.active.subscribeCta });
  await (opts.card === 'regular' ? subscribeButtons.first() : subscribeButtons.last()).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const combobox = dialog.getByRole('combobox', { name: L.wizard.formulaLabel }).or(dialog.getByRole('combobox').first());
  await expect(combobox).toBeEnabled({ timeout: 3000 });
  // The formulas query re-render can close a freshly opened listbox; reopen
  // until the wanted option is actually there before clicking it.
  const option = win.getByRole('option', { name: escapeRegExp(opts.formulaLabel) });
  for (let attempt = 0; attempt < 4 && !(await option.isVisible()); attempt += 1) {
    await combobox.click();
    await option.waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined);
  }
  await option.click();
  if (opts.startMonth) {
    await dialog.getByLabel(L.wizard.startMonthLabel, { exact: false }).fill(opts.startMonth);
  }
  await dialog.getByRole('button', { name: L.wizard.confirm }).click();
  await expect(dialog).toBeHidden();
}

export const SOU289_STR: Record<
  Locale,
  {
    toast: {
      /** Success toast when the current month's draft invoice was generated at enrollment. */
      ready: string;
      /** Info toast when the month's invoice already covered this formula. */
      alreadyBilled: string;
      /** Warning toast when the month's invoice was already issued — formula NOT billed. */
      issuedSkipped: string;
      /** Calm toast for a future startMonth — invoice waits for that month's batch. */
      deferred: string;
      /** The toast's open-the-invoice action. */
      view: string;
    };
    /** The student detail "Factures" tab's own empty state (`students.invoices.empty`). */
    studentInvoicesEmptyTitle: string;
    lineEdit: {
      /** Accessible name of the per-line edit affordance; `{{label}}` interpolated. */
      actionFor: (label: string) => string | RegExp;
      title: string;
      amount: string;
      submit: string;
      cancel: string;
      success: string;
      invalidAmount: string;
    };
  }
> = {
  fr: {
    toast: {
      ready: 'Abonnement enregistré. La facture du mois est prête.',
      alreadyBilled: 'Abonnement enregistré. La facture de ce mois couvre déjà cette formule.',
      issuedSkipped:
        "Abonnement enregistré, mais la facture de ce mois a déjà été émise : cette formule n'y figure pas. Ajustez la facturation manuellement.",
      deferred: 'Abonnement enregistré. La facture sera générée au début du mois choisi, avec la facturation mensuelle.',
      view: 'Voir la facture',
    },
    studentInvoicesEmptyTitle: "Aucune facture pour l'instant",
    lineEdit: {
      actionFor: (label: string) => `Modifier le montant de « ${label} »`,
      title: 'Modifier le montant',
      amount: 'Nouveau montant (MAD)',
      submit: 'Enregistrer',
      cancel: 'Annuler',
      success: 'Montant mis à jour.',
      invalidAmount: 'Montant invalide',
    },
  },
  ar: {
    toast: {
      ready: 'تم تسجيل الاشتراك. فاتورة الشهر جاهزة.',
      alreadyBilled: 'تم تسجيل الاشتراك. فاتورة هذا الشهر تغطي هذه الصيغة بالفعل.',
      issuedSkipped: 'تم تسجيل الاشتراك، لكن فاتورة هذا الشهر صدرت من قبل ولا تتضمن هذه الصيغة. عدّل الفوترة يدويًا.',
      deferred: 'تم تسجيل الاشتراك. ستُنشأ الفاتورة في بداية الشهر المختار مع الفوترة الشهرية.',
      view: 'عرض الفاتورة',
    },
    studentInvoicesEmptyTitle: 'لا فواتير بعد',
    lineEdit: {
      actionFor: (label: string) => `تعديل مبلغ «${label}»`,
      title: 'تعديل المبلغ',
      amount: 'المبلغ الجديد (درهم)',
      submit: 'حفظ',
      cancel: 'إلغاء',
      success: 'تم تحديث المبلغ.',
      invalidAmount: 'مبلغ غير صالح',
    },
  },
};

/** The current calendar month (`YYYY-MM`) — the wizard's own default startMonth. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** `offset` months after (or before, negative) `month`, rolling year boundaries. */
export function shiftMonth(month: string, offset: number): string {
  const [yearPart, monthPart] = month.split('-');
  return new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1 + offset, 1)).toISOString().slice(0, 7);
}

export type InvoiceView = {
  id: string;
  studentId: string;
  month: string;
  status: 'draft' | 'issued' | 'cancelled';
  lines: { id: string; formulaId: string; label: { fr: string; ar: string }; kind: string; amountMad: number }[];
  totalMad: number;
};

/** All invoices of one student, straight off the public `invoice.list` bridge. */
export async function listStudentInvoices(win: Page, studentId: string): Promise<InvoiceView[]> {
  return win.evaluate(async (id) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('invoice.list', { studentId: id })) as { invoices: InvoiceView[] };
    return res.invoices;
  }, studentId);
}

export type SubscriptionCreateResponse = {
  id: string;
  invoiceOutcome: string;
  invoiceId: string | null;
};

/** `subscription.create` through the public bridge, returning the SOU-289 response contract. */
export async function createSubscriptionViaBridge(
  win: Page,
  payload: { studentId: string; formulaId: string; kind: 'regular' | 'exam-prep'; subjectIds: string[]; startMonth: string },
): Promise<SubscriptionCreateResponse> {
  return win.evaluate(async (p) => {
    const api = (window as unknown as { api: Bridge }).api;
    return (await api.invoke('subscription.create', p)) as SubscriptionCreateResponse;
  }, payload);
}

/** Seed one student through the bridge (no UI), for the bridge-level scenarios. */
export async function seedStudentViaBridge(
  win: Page,
  s: { nameFr: string; nameAr: string; birthDate: string; level: string },
): Promise<{ studentId: string }> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    const student = (await api.invoke('student.create', {
      name: { fr: o.nameFr, ar: o.nameAr },
      birthDate: o.birthDate,
      level: o.level,
    })) as { id: string };
    return { studentId: student.id };
  }, s);
}

/** Move a draft invoice to `issued` through the public bridge. */
export async function issueInvoiceViaBridge(win: Page, invoiceId: string): Promise<void> {
  await win.evaluate(async (id) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('invoice.issue', { invoiceId: id });
  }, invoiceId);
}

/** Run the monthly generation batch through the public bridge. */
export async function generateMonthlyViaBridge(win: Page, month: string): Promise<unknown> {
  return win.evaluate(async (m) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('invoice.generateMonthly', { month: m });
  }, month);
}

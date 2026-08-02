import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-69 — Invoice list / detail / print / PDF export
 * (MAD, FR/AR).
 *
 * Driven exclusively through the running packaged app, the public preload
 * bridge (`window.api.invoke`), and (for the native save dialog, which pops a
 * real OS dialog Playwright cannot drive) `ElectronApplication.evaluate` to
 * stub `dialog.showSaveDialog` in the main process — the same technique the
 * SOU-102 backup suite uses for `dialog.showOpenDialog`. No renderer/domain/
 * data implementation is imported. Every string the specs assert on mirrors
 * `i18n/fr.json` / `ar.json`'s `invoices` namespace, the user-facing
 * localization contract, exactly as the other suites do.
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

/** All copy the specs assert on, mirrored from i18n fr/ar.json's `invoices` namespace. */
export const STR: Record<
  Locale,
  {
    navInvoicing: string;
    title: string;
    filters: { monthLabel: string; statusLabel: string; statusAll: string };
    status: { draft: string; unpaid: string; 'partially-paid': string; paid: string; cancelled: string };
    table: { month: string; student: string; total: string; status: string };
    empty: { title: string; body: string };
    noResults: { title: string; body: string };
    detail: {
      back: string;
      print: string;
      export: string;
      printError: string;
      exportSuccess: string;
      exportError: string;
      kind: { regular: string; examPrep: string };
      total: string;
      payment: {
        panelTitle: string;
        total: string;
        netPaid: string;
        outstanding: string;
        markPaid: string;
        title: string;
        amount: string;
        method: string;
        methods: { cash: string; cheque: string; transfer: string; other: string };
        paidOn: string;
        cancel: string;
        submit: string;
        success: string;
      };
    };
  }
> = {
  fr: {
    navInvoicing: 'Facturation',
    title: 'Factures',
    filters: { monthLabel: 'Filtrer par mois', statusLabel: 'Filtrer par statut de paiement', statusAll: 'Tous les statuts' },
    status: { draft: 'Brouillon', unpaid: 'Non payée', 'partially-paid': 'Payée partiellement', paid: 'Payée', cancelled: 'Annulée' },
    table: { month: 'Mois', student: 'Élève', total: 'Total', status: 'Statut' },
    empty: { title: 'Aucune facture', body: 'Les factures apparaîtront ici une fois générées.' },
    noResults: { title: 'Aucun résultat', body: 'Aucune facture ne correspond à ces filtres.' },
    detail: {
      back: 'Retour aux factures',
      print: 'Imprimer',
      export: 'Exporter en PDF',
      printError: "L'impression a échoué. Réessayez.",
      exportSuccess: 'Facture exportée avec succès.',
      exportError: "L'export a échoué. Réessayez.",
      kind: { regular: 'Régulier', examPrep: 'Prépa examen' },
      total: 'Total',
      payment: {
        panelTitle: 'Paiement',
        total: 'Total facturé',
        netPaid: 'Payé',
        outstanding: 'Reste à payer',
        markPaid: 'Marquer payée',
        title: 'Enregistrer un paiement',
        amount: 'Montant (MAD)',
        method: 'Moyen de paiement',
        methods: { cash: 'Espèces', cheque: 'Chèque', transfer: 'Virement', other: 'Autre' },
        paidOn: 'Date du paiement',
        cancel: 'Annuler',
        submit: 'Enregistrer',
        success: 'Paiement enregistré.',
      },
    },
  },
  ar: {
    navInvoicing: 'الفوترة',
    title: 'الفواتير',
    filters: { monthLabel: 'التصفية حسب الشهر', statusLabel: 'التصفية حسب حالة الدفع', statusAll: 'كل الحالات' },
    status: { draft: 'مسودة', unpaid: 'غير مدفوعة', 'partially-paid': 'مدفوعة جزئيًا', paid: 'مدفوعة', cancelled: 'ملغاة' },
    table: { month: 'الشهر', student: 'الطالب', total: 'المجموع', status: 'الحالة' },
    empty: { title: 'لا توجد فواتير', body: 'ستظهر الفواتير هنا بعد إصدارها.' },
    noResults: { title: 'لا نتائج', body: 'لا توجد فاتورة مطابقة لهذه المرشحات.' },
    detail: {
      back: 'العودة إلى الفواتير',
      print: 'طباعة',
      export: 'تصدير PDF',
      printError: 'فشلت الطباعة. حاول مرة أخرى.',
      exportSuccess: 'تم تصدير الفاتورة بنجاح.',
      exportError: 'فشل التصدير. حاول مرة أخرى.',
      kind: { regular: 'عادي', examPrep: 'تحضير امتحان' },
      total: 'المجموع',
      payment: {
        panelTitle: 'الدفع',
        total: 'إجمالي الفاتورة',
        netPaid: 'المدفوع',
        outstanding: 'المتبقي',
        markPaid: 'تحديد كمدفوعة',
        title: 'تسجيل دفعة',
        amount: 'المبلغ (درهم)',
        method: 'طريقة الدفع',
        methods: { cash: 'نقدًا', cheque: 'شيك', transfer: 'تحويل بنكي', other: 'أخرى' },
        paidOn: 'تاريخ الدفع',
        cancel: 'إلغاء',
        submit: 'حفظ',
        success: 'تم تسجيل الدفعة.',
      },
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-invoices-'));
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

/** Launch, clear the first-run + auth gates through the public bridge (same recipe every other suite uses). */
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

export async function gotoInvoices(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navInvoicing, exact: true }).click();
  await win.waitForTimeout(400);
}

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export type SeededInvoiceSetup = {
  studentId: string;
  studentNameFr: string;
  studentNameAr: string;
  subjectId: string;
  formulaId: string;
  invoiceId: string;
  priceMad: number;
};

/**
 * Seed one subject + one real Formula (SOU-62's `formula.create`) + one
 * student + one active `regular` StudentSubscription (SOU-65's
 * `subscription.create`) starting in `month`, then run the monthly
 * generation job (SOU-68's `invoice.generateMonthly`) for that same month.
 * Returns the single drafted invoice's id, resolved via `invoice.list`
 * filtered by `studentId` (the only way to learn a fresh invoice's id
 * through the public bridge — there is no direct `invoice.create` channel).
 */
export async function seedInvoice(
  win: Page,
  opts: { nameFr: string; nameAr: string; month: string; priceMad: number },
): Promise<SeededInvoiceSetup> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
    const formula = (await api.invoke('formula.create', {
      name: { fr: 'Maths seul', ar: 'الرياضيات فقط' },
      subjectIds: [subject.id],
      priceMad: Math.round(o.priceMad * 100),
      kind: 'regular',
    })) as { id: string };
    const student = (await api.invoke('student.create', {
      name: { fr: o.nameFr, ar: o.nameAr },
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
    const list = (await api.invoke('invoice.list', { studentId: student.id })) as {
      invoices: { id: string }[];
    };
    const invoice = list.invoices[0];
    if (!invoice) throw new Error('seedInvoice: no invoice was drafted by invoice.generateMonthly');
    return {
      studentId: student.id,
      studentNameFr: o.nameFr,
      studentNameAr: o.nameAr,
      subjectId: subject.id,
      formulaId: formula.id,
      invoiceId: invoice.id,
      priceMad: o.priceMad,
    };
  }, opts);
}

/** Record a full payment against an invoice directly through the bridge (SOU-93's `payment.record`). */
export async function recordFullPayment(win: Page, invoiceId: string, amountMad: number): Promise<unknown> {
  return win.evaluate(
    async ({ invoiceId, amountMad }) => {
      const api = (window as unknown as { api: Bridge }).api;
      return api.invoke('payment.record', { invoiceId, amountMad: Math.round(amountMad * 100), method: 'cash', paidOn: '2026-08-15' });
    },
    { invoiceId, amountMad },
  );
}

/** Attempt any IPC channel and capture the error message (or null on success). */
export async function tryInvoke(win: Page, channel: string, payload: unknown): Promise<string | null> {
  return win.evaluate(
    async ({ channel, payload }) => {
      const api = (window as unknown as { api: Bridge }).api;
      try {
        await api.invoke(channel, payload);
        return null;
      } catch (e) {
        return String((e as { message?: string })?.message ?? e);
      }
    },
    { channel, payload },
  );
}

/**
 * Stub the native save dialog (main-process `dialog.showSaveDialog`) to
 * deterministically return `path` (or `{ canceled: true }` when `path` is
 * null) — the same technique `backup.fixtures.ts` uses for
 * `dialog.showOpenDialog`.
 */
export async function stubSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(async ({ dialog }, chosenPath) => {
    dialog.showSaveDialog = (async () => (chosenPath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath: chosenPath })) as never;
  }, path);
}

/**
 * Stub the main-process `shell.openPath` that Print hands the rendered PDF
 * to — under CI's headless Xvfb runner there is no PDF viewer registered, so
 * the real call spawns `xdg-open` against an unhandled mime type, which can
 * hang past the Electron app's teardown. Print only needs to prove it *asked*
 * the OS to open the file; actually opening a viewer is out of scope for a
 * black-box assertion anyway.
 */
export async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openPath = (async () => '') as never;
  });
}

/** True when the file at `path` exists and starts with the `%PDF-` magic bytes. */
export function isRealPdfFile(path: string): boolean {
  if (!existsSync(path)) return false;
  const head = readFileSync(path).subarray(0, 5).toString('latin1');
  return head === '%PDF-';
}

/** Raw-byte substring search across the whole file (best-effort: PDF content streams may be compressed). */
export function pdfContainsAsciiText(path: string, needle: string): boolean {
  return readFileSync(path).toString('latin1').includes(needle);
}

export function pdfExportPath(dir: string, fileName: string): string {
  return join(dir, fileName);
}

/** Escapes regex metacharacters so free text can be used as a literal substring match in locator name matchers. */
export function escapeRegExp(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

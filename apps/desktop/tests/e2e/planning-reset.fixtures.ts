import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-295 — the planner "réinitialiser le planning" danger
 * zone. Driven only through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every asserted string was mirrored from the shipped i18n bundle
 * (`i18n/fr.json` / `ar.json`) in both locales, never re-derived in the test.
 *
 * The real `planning.reset` IPC handler is wired on this branch, so the specs
 * assert PERSISTED outcomes, not just UI copy: reference data + weekly recurring
 * templates + dated occurrences are seeded through the same public channels the
 * app itself uses (`room.create`, `teacher.create`, `subject.create`,
 * `group.create`, `weeklySession.create`, `session.generate`); the reset is
 * driven through the UI; then the weekly read model (`session.week`) and the real
 * success-toast deletion count prove the future planning was wiped, the recurrence
 * stopped (templates tombstoned), and past-dated occurrences survived.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const STR: Record<
  Locale,
  {
    navPlanning: string;
    planningTitle: string;
    resetTrigger: string;
    dialogTitle: string;
    cutoffLegend: string;
    cutoffToday: string;
    cutoffTomorrow: string;
    cutoffHintPrefix: string;
    warning: string;
    confirmWord: string;
    confirmButton: string;
    successPrefix: string;
    emptyWeek: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    navPlanning: 'Planning',
    planningTitle: 'Planning hebdomadaire',
    resetTrigger: 'Réinitialiser le planning',
    dialogTitle: 'Réinitialiser le planning ?',
    cutoffLegend: 'À partir de quand effacer ?',
    cutoffToday: "Inclure aujourd'hui",
    cutoffTomorrow: 'À partir de demain',
    cutoffHintPrefix: 'Les séances à partir du',
    warning: 'Action irréversible',
    confirmWord: 'RÉINITIALISER',
    confirmButton: 'Réinitialiser le planning',
    successPrefix: 'Planning réinitialisé',
    emptyWeek: 'Aucune séance planifiée cette semaine.',
    dir: 'ltr',
  },
  ar: {
    navPlanning: 'الجدولة',
    planningTitle: 'الجدول الأسبوعي',
    resetTrigger: 'إعادة تعيين الجدول',
    dialogTitle: 'إعادة تعيين الجدول؟',
    cutoffLegend: 'ابتداءً من متى يتم الحذف؟',
    cutoffToday: 'تضمين اليوم',
    cutoffTomorrow: 'ابتداءً من الغد',
    cutoffHintPrefix: 'ستُحذف الحصص ابتداءً من',
    warning: 'إجراء لا رجعة فيه',
    confirmWord: 'إعادة التعيين',
    confirmButton: 'إعادة تعيين الجدول',
    successPrefix: 'تمت إعادة تعيين الجدول',
    emptyWeek: 'لا توجد حصص مبرمجة هذا الأسبوع.',
    dir: 'rtl',
  },
};

export type Launched = { app: ElectronApplication; win: Page };
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-planning-reset-'));
}

export async function launch(
  locale: Locale,
  options: { omitFeatures?: readonly string[] } = {},
): Promise<Launched> {
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' };
  delete env['CS_E2E_OMIT_FEATURES'];
  if (options.omitFeatures && options.omitFeatures.length > 0) {
    env['CS_E2E_OMIT_FEATURES'] = options.omitFeatures.join(',');
  }
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const bw = await app.browserWindow(win);
  await bw.evaluate((w: { setBounds: (b: object) => void }) => w.setBounds({ x: 0, y: 0, width: 1500, height: 1200 }));
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  return { app, win };
}

/** Reload past the boot wizard / auth gate, open the weekly planner via the sidebar. */
export async function gotoPlanner(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error|Une erreur est survenue|حدث خطأ/i.test(document.body.innerText),
  );
}

/**
 * Deterministic far-past / far-future windows, chosen so the reset's cutoff
 * ("today", ~2026 by the injected Clock) always lands strictly between them —
 * the assertion never depends on the exact wall clock. A 7-consecutive-day
 * window contains each weekday exactly once (→ 1 occurrence of a given
 * `dayOfWeek`); a 14-day window contains it exactly twice (→ 2 occurrences).
 */
export const WINDOW = {
  pastWeek: { from: '2020-06-01', to: '2020-06-07' },
  futureWeek: { from: '2030-06-03', to: '2030-06-09' },
  futureTwoWeeks: { from: '2030-06-03', to: '2030-06-16' },
} as const;

export type SeededTemplate = { id: string; dayOfWeek: number };
export type SeededPlanning = { templates: SeededTemplate[] };
export type OccurrenceWindow = { recurringSessionId: string; from: string; to: string };

/**
 * Seed shared reference data (one room / teacher / subject / group) and N weekly
 * recurring templates through the public write channels. All templates hang off
 * the same room+teacher on distinct weekdays, so no room/teacher overlap is
 * triggered at create time. Returns the template ids for later occurrence
 * materialization.
 */
export async function seedTemplates(
  win: Page,
  templates: readonly { dayOfWeek: number; start: string; end: string }[],
): Promise<SeededPlanning> {
  return win.evaluate(async (specs) => {
    const api = (window as unknown as { api: Bridge }).api;
    const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
    const teacher = (await api.invoke('teacher.create', {
      name: { fr: 'Ahmed Benali', ar: 'أحمد بنعلي' },
      phone: '+212600000001',
      subjectIds: [],
    })) as { id: string };
    const subject = (await api.invoke('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      code: 'MATH',
    })) as { id: string };
    const group = (await api.invoke('group.create', {
      subjectId: subject.id,
      teacherId: teacher.id,
      level: '2 Bac SM',
      capacity: 15,
      kind: 'regular',
    })) as { id: string };

    const out: { id: string; dayOfWeek: number }[] = [];
    for (const s of specs) {
      const wrs = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: teacher.id,
        groupId: group.id,
        dayOfWeek: s.dayOfWeek,
        start: s.start,
        end: s.end,
      })) as { id: string };
      out.push({ id: wrs.id, dayOfWeek: s.dayOfWeek });
    }
    return { templates: out };
  }, templates);
}

/** Materialize dated occurrences of a template over [from,to] via the public generator channel. */
export async function generateOccurrences(win: Page, windows: readonly OccurrenceWindow[]): Promise<void> {
  await win.evaluate(async (ws) => {
    const api = (window as unknown as { api: Bridge }).api;
    for (const w of ws) {
      await api.invoke('session.generate', { recurringSessionId: w.recurringSessionId, from: w.from, to: w.to });
    }
  }, windows);
}

/**
 * Attempt to re-materialize a tombstoned template's occurrences. A reset should
 * make this a no-op (the template is soft-deleted, so nothing regenerates); the
 * call may resolve to nothing or reject — either way the caller asserts the
 * end-state (no resurrection). Returns whether the call threw.
 */
export async function tryRegenerate(win: Page, windows: readonly OccurrenceWindow[]): Promise<boolean> {
  return win.evaluate(async (ws) => {
    const api = (window as unknown as { api: Bridge }).api;
    try {
      for (const w of ws) {
        await api.invoke('session.generate', { recurringSessionId: w.recurringSessionId, from: w.from, to: w.to });
      }
      return false;
    } catch {
      return true;
    }
  }, windows);
}

/** Count of live (non-tombstoned) weekly recurring templates in the center's read model. */
export async function readTemplateCount(win: Page): Promise<number> {
  const res = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: unknown[] };
  return res.sessions.length;
}

const AR_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Extract the deletion count from the success toast, locale-robustly: the AR
 * project renders the number in Arabic-Indic digits, so normalize those to ASCII
 * before parsing. Returns the integer N from "… {{n}} séances supprimées" /
 * "… {{n}} حصة".
 */
export function parseDeletedCount(toastText: string): number {
  const ascii = toastText.replace(/[٠-٩]/g, (d) => String(AR_INDIC_DIGITS.indexOf(d)));
  const match = ascii.match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

/**
 * Drive the full destructive flow through the UI: open the danger-zone dialog,
 * pick a cutoff, type the exact confirmation word, confirm, and return the
 * success-toast text. Black-box — no direct `planning.reset` invoke.
 */
export async function performResetViaUi(
  win: Page,
  L: (typeof STR)[Locale],
  cutoff: 'today' | 'tomorrow',
): Promise<string> {
  // A prior reset's success toast may still be on screen when this helper runs a
  // second time in one flow. Snapshot the toasts already present so we can wait
  // for a genuinely NEW one rather than racing the stale toast (reading .first()
  // or .last() is non-deterministic while both are visible). The two resets in a
  // flow always report different counts, so a not-yet-seen text is the new toast.
  const toasts = win.getByText(L.successPrefix, { exact: false });
  const before = new Set(await toasts.allTextContents());

  await win.getByRole('button', { name: L.resetTrigger }).click();
  const dialog = win.getByRole('dialog');
  await dialog.getByRole('heading', { name: L.dialogTitle }).waitFor();
  await dialog.getByRole('radio', { name: cutoff === 'today' ? L.cutoffToday : L.cutoffTomorrow }).click();
  await dialog.getByRole('textbox').fill(L.confirmWord);
  const confirm = dialog.getByRole('button', { name: L.confirmButton, exact: true });
  await confirm.click();

  let fresh = '';
  await expect(async () => {
    const added = (await toasts.allTextContents()).find((text) => !before.has(text));
    expect(added, 'a new reset success toast should appear').toBeTruthy();
    fresh = added ?? '';
  }).toPass();
  return fresh;
}

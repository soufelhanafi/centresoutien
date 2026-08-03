import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  boot,
  gotoPlanning,
  createSessionViaBridge,
  STR,
  DIRECTION,
  type Locale,
  type Launched,
  type Seeded,
  type SeedSpec,
} from './planning-sessions.fixtures';

/**
 * Black-box fixtures for SOU-107 — Weekly schedule print / PDF export
 * (per room / per teacher / per group / full grid).
 *
 * Driven only through the running packaged app: the planner UI, the export
 * dialog, and the two public IPC channels the dialog ultimately calls
 * (`schedule.print` / `schedule.export`, stubbed at the OS boundary through
 * `dialog.showSaveDialog` / `shell.openPath`, the same technique the SOU-69
 * invoice-export suite uses). No renderer / domain / data implementation is
 * imported.
 *
 * The reference-data seeding, the planner boot recipe (admin + login, NO
 * first-run wizard, so `center.get` starts null), and every user-facing string
 * are reused from the SOU-131 planning fixtures — this ticket only adds an
 * export surface on top of that same planner.
 */

export { boot, gotoPlanning, createSessionViaBridge, STR, DIRECTION };
export type { Locale, Launched, Seeded, SeedSpec };

/** Export-dialog copy, mirrored from i18n `planning.export` (fr/ar.json). */
export const EXPORT_STR: Record<
  Locale,
  {
    trigger: string;
    title: string;
    view: { full: string; room: string; teacher: string; group: string };
    print: string;
    export: string;
    cancel: string;
    printSuccess: string;
    printError: string;
    exportSuccess: string;
    exportError: string;
    pickRoom: string;
    pickTeacher: string;
    pickGroup: string;
  }
> = {
  fr: {
    trigger: 'Exporter le planning',
    title: 'Exporter le planning',
    view: { full: 'Grille complète', room: 'Par salle', teacher: 'Par enseignant', group: 'Par groupe' },
    print: 'Imprimer',
    export: 'Exporter en PDF',
    cancel: 'Annuler',
    printSuccess: "Planning envoyé à l'impression",
    printError: "L'impression du planning a échoué.",
    exportSuccess: 'Planning exporté',
    exportError: "L'export du planning a échoué.",
    pickRoom: 'Choisir une salle',
    pickTeacher: 'Choisir un enseignant',
    pickGroup: 'Choisir un groupe',
  },
  ar: {
    trigger: 'تصدير الجدول',
    title: 'تصدير الجدول الأسبوعي',
    view: { full: 'الشبكة الكاملة', room: 'حسب القاعة', teacher: 'حسب الأستاذ', group: 'حسب المجموعة' },
    print: 'طباعة',
    export: 'تصدير PDF',
    cancel: 'إلغاء',
    printSuccess: 'تم إرسال الجدول للطباعة',
    printError: 'فشلت طباعة الجدول.',
    exportSuccess: 'تم تصدير الجدول',
    exportError: 'فشل تصدير الجدول.',
    pickRoom: 'اختر قاعة',
    pickTeacher: 'اختر أستاذًا',
    pickGroup: 'اختر مجموعة',
  },
};

/** Settings center-profile copy needed for the AC5 (center name / logo) scenario. */
export const SETTINGS_STR: Record<Locale, { nav: string; name: string; phone: string; logo: string; submit: string }> = {
  fr: { nav: 'Paramètres', name: 'Nom du centre', phone: 'Téléphone', logo: 'Logo', submit: 'Enregistrer' },
  ar: { nav: 'الإعدادات', name: 'اسم المركز', phone: 'الهاتف', logo: 'الشعار', submit: 'حفظ' },
};

export type ExportView = 'full' | 'room' | 'teacher' | 'group';

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/**
 * Deterministically resolve the native save dialog to `path` (or a cancel when
 * `path` is null) so `schedule.export` writes to a known file with no OS UI —
 * mirrors `invoices.fixtures.ts#stubSaveDialog`.
 */
export async function stubSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(async ({ dialog }, chosenPath) => {
    dialog.showSaveDialog = (async () =>
      chosenPath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath: chosenPath }) as never;
  }, path);
}

/** Neutralize `shell.openPath` so Print never spawns an external viewer that could hang teardown. */
export async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openPath = (async () => '') as never;
  });
}

export function freshExportDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-schedule-export-'));
}

export function exportPath(dir: string, fileName: string): string {
  return join(dir, fileName);
}

/** True when the file exists and starts with the `%PDF-` magic bytes. */
export function isRealPdfFile(path: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path).subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * True when every `/MediaBox` in the PDF is A4 landscape (width 841.89 ×
 * height 595.28 pt). Landscape ⇒ width > height, which is the orientation
 * the "fits 8 rooms on A4" acceptance bullet requires.
 */
export function isA4Landscape(path: string): boolean {
  const boxes = readFileSync(path).toString('latin1').match(/MediaBox\s*\[[^\]]*\]/g);
  if (!boxes || boxes.length === 0) return false;
  return boxes.every((b) => /841\.8[0-9]/.test(b) && /595\.2[0-9]/.test(b));
}

/** True when the PDF embeds a raster image XObject (a logo drawn as an image). */
export function pdfEmbedsImage(path: string): boolean {
  return /\/Subtype\s*\/Image/.test(readFileSync(path).toString('latin1'));
}

/** True when the PDF embeds the Amiri Arabic font (the AR-shaping font). */
export function pdfEmbedsAmiri(path: string): boolean {
  return readFileSync(path).toString('latin1').includes('Amiri');
}

/** A 1×1 PNG on disk for the Settings logo <input type=file>. */
export function makeLogoFile(): string {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f0005000101a5f645b70000000049454e44ae426082',
    'hex',
  );
  const dir = mkdtempSync(join(tmpdir(), 'cs-e2e-logo-'));
  const p = join(dir, 'logo.png');
  writeFileSync(p, png);
  return p;
}

/** The persisted center row through the public bridge (null before any profile save). */
export async function getCenter(win: Page): Promise<null | { name: string; logoPath: string | null }> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('center.get', {})) as { center: unknown };
    return res.center as never;
  });
}

/**
 * Save a center profile through the Settings form (the real, shipped UI — this
 * ticket adds no upload UI). Fills the required name + phone, optionally sets a
 * logo, and submits. Returns to the planner afterward.
 */
export async function saveCenterProfile(
  win: Page,
  loc: Locale,
  opts: { name: string; phone: string; logoFile?: string },
): Promise<void> {
  const S = SETTINGS_STR[loc];
  await win.getByRole('link', { name: S.nav }).click();
  const form = win.locator('form', { has: win.locator('input[name="phone"]') });
  await form.locator('input[name="phone"]').waitFor({ state: 'visible' });
  await win.getByLabel(S.name, { exact: true }).fill(opts.name);
  await win.getByLabel(S.phone, { exact: true }).fill(opts.phone);
  if (opts.logoFile) {
    await win.getByLabel(S.logo, { exact: true }).setInputFiles(opts.logoFile);
    await win.waitForTimeout(300);
  }
  await form.getByRole('button', { name: S.submit, exact: true }).click();
  await win.waitForTimeout(700);
}

/** Open the schedule export dialog from the planner header. */
export async function openExportDialog(win: Page, loc: Locale) {
  await win.getByRole('button', { name: EXPORT_STR[loc].trigger }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.waitFor();
  return dialog;
}

/** Close the export dialog (it stays open after an export completes). */
export async function closeExportDialog(win: Page): Promise<void> {
  await win.keyboard.press('Escape').catch(() => {});
  await win.getByRole('dialog').waitFor({ state: 'hidden' }).catch(() => {});
  await win.waitForTimeout(150);
}

/**
 * In a per-filter tab (room/teacher/group) pick a specific value from the
 * combobox that appears. `full` needs no selection.
 */
async function selectFilter(win: Page, loc: Locale, view: ExportView, value: string): Promise<void> {
  if (view === 'full') return;
  const label = EXPORT_STR[loc].view[view];
  await win.getByRole('dialog').getByRole('combobox', { name: label }).click();
  // Group options carry a "Subject — Level" (+ exam-prep badge) accessible name,
  // so match the caller's distinguishing value as a substring, not exactly.
  await win.getByRole('option', { name: value, exact: false }).first().click();
}

/** The accessible names of the options in a per-filter combobox (proves it lists real reference data). */
export async function filterOptions(win: Page, loc: Locale, view: Exclude<ExportView, 'full'>): Promise<string[]> {
  const dialog = win.getByRole('dialog');
  await dialog.getByRole('tab', { name: EXPORT_STR[loc].view[view] }).click();
  await dialog.getByRole('combobox', { name: EXPORT_STR[loc].view[view] }).click();
  await win.waitForTimeout(200);
  const opts = await win.getByRole('option').allInnerTexts();
  await win.keyboard.press('Escape').catch(() => {});
  return opts.map((o) => o.trim()).filter(Boolean);
}

/** True while the Export/Print action buttons are disabled (no filter chosen yet). */
export async function exportDisabled(win: Page, loc: Locale): Promise<boolean> {
  const btn = win.getByRole('dialog').getByRole('button', { name: EXPORT_STR[loc].export, exact: true });
  return !(await btn.isEnabled());
}

/**
 * Full flow: open dialog → select the view (+ filter value) → Export → save to
 * `target` → close dialog. Returns nothing; assert on the written file.
 */
export async function exportSchedule(
  live: Launched,
  loc: Locale,
  view: ExportView,
  target: string,
  filterValue?: string,
): Promise<void> {
  const { win, app } = live;
  const dialog = await openExportDialog(win, loc);
  await dialog.getByRole('tab', { name: EXPORT_STR[loc].view[view] }).click();
  if (view !== 'full') await selectFilter(win, loc, view, filterValue ?? '');
  await stubSaveDialog(app, target);
  await dialog.getByRole('button', { name: EXPORT_STR[loc].export, exact: true }).click();
  await win.waitForTimeout(1000);
  await closeExportDialog(win);
}

/** True when the renderer error boundary is showing. */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

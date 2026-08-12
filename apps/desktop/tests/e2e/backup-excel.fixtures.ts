import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  freshUserDataDir,
  launch,
  VALID_ADMIN,
  type Launched,
  type Locale,
} from './wizard.fixtures';

/**
 * SOU-44 — Excel backup / restore card in Settings, black-box fixtures.
 *
 * Driven only through the running packaged app and the public preload bridge.
 * The Excel card lives in the Settings > "Sauvegarde" tab (the SOU-102 backup
 * tab) as a new "Sauvegarde Excel" card. Native Save-As / Open dialogs are
 * stubbed in the main process (`dialog.showSaveDialog` / `dialog.showOpenDialog`)
 * exactly like the SOU-69 invoice and SOU-102 backup suites do. All copy is
 * mirrored from i18n fr/ar.json (`settings.backup.excel.*`, `plan.locked`).
 */

export { freshUserDataDir, launch, VALID_ADMIN, type Launched, type Locale };

export type BackupSettingsStrings = {
  backupTab: string;
  excelTitle: string;
  exportButton: string;
  exportSuccess: string;
  importButton: string;
  countCreated: string;
  countUpdated: string;
  countDuplicate: string;
  countInvalid: string;
  colSheet: string;
  colRow: string;
  colStatus: string;
  colReason: string;
  applyButton: RegExp;
  applySuccessPrefix: string;
  confirmTitle: string;
  confirmApply: string;
  locked: string;
  noApplicable: string;
};

export const XLS: Record<Locale, BackupSettingsStrings> = {
  fr: {
    backupTab: 'Sauvegarde',
    excelTitle: 'Sauvegarde Excel',
    exportButton: 'Exporter la sauvegarde Excel',
    exportSuccess: 'Sauvegarde Excel exportée',
    importButton: 'Importer un fichier Excel',
    countCreated: 'Créées',
    countUpdated: 'Mises à jour',
    countDuplicate: 'Doublons',
    countInvalid: 'Invalides',
    colSheet: 'Feuille',
    colRow: 'Ligne Excel',
    colStatus: 'Statut',
    colReason: 'Raison',
    applyButton: /Importer \d+ ligne/,
    applySuccessPrefix: 'Import terminé',
    confirmTitle: "Confirmer l'import",
    confirmApply: 'Importer',
    locked: 'Réservé à un plan supérieur',
    noApplicable: "Ce fichier ne contient aucune ligne à importer.",
  },
  ar: {
    backupTab: 'النسخ الاحتياطي',
    excelTitle: 'نسخ احتياطي Excel',
    exportButton: 'تصدير النسخة الاحتياطية إلى Excel',
    exportSuccess: 'تم تصدير النسخة الاحتياطية إلى Excel',
    importButton: 'استيراد ملف Excel',
    countCreated: 'مُنشأة',
    countUpdated: 'مُحدَّثة',
    countDuplicate: 'مكررة',
    countInvalid: 'غير صالحة',
    colSheet: 'الورقة',
    colRow: 'سطر Excel',
    colStatus: 'الحالة',
    colReason: 'السبب',
    // Match on the count only: Arabic pluralizes the noun across categories
    // (سطر / سطرين / أسطر / سطرًا), so anchoring on a single form misses the
    // "few" bucket (counts 3–10, "أسطر") the import row count can land in.
    applyButton: /استيراد \d+/,
    applySuccessPrefix: 'اكتمل الاستيراد',
    confirmTitle: 'تأكيد الاستيراد',
    confirmApply: 'استيراد',
    locked: 'غير متاح في خطتك',
    noApplicable: 'لا يحتوي هذا الملف على أي سطر قابل للاستيراد.',
  },
};

/** Landing on Settings lands on the Profile tab; the backup tab is where the Excel card lives. */
export async function gotoBackupTab(win: Page, loc: Locale) {
  await win.getByRole('link', { name: loc === 'ar' ? 'الإعدادات' : 'Paramètres' }).click();
  await win.getByRole('tab', { name: XLS[loc].backupTab, exact: true }).click();
  return win.getByRole('tabpanel');
}

/**
 * Seed one student through the public bridge (the same `student.create`
 * channel the app's own form calls) so the exported workbook has >= 1 row.
 * Returns the student id so the import preview can be correlated.
 */
export async function seedOneStudent(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<{ id: string }> };
    }).api;
    const res = await api.invoke('student.create', {
      name: { fr: 'QA Élève Excel', ar: 'طالب اختبار إكسل' },
      birthDate: '2011-03-12',
      level: '3AC',
    });
    return res.id;
  });
}

/** Stub the native Save-As dialog to deterministically return `path`. */
export async function stubSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(async ({ dialog }, chosenPath) => {
    dialog.showSaveDialog = (async () =>
      chosenPath === null ? { canceled: true, filePath: undefined } : { canceled: false, filePath: chosenPath }) as never;
  }, path);
}

/** Stub the native Open dialog to deterministically return `path`. */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(async ({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
  }, path);
}

export function freshBackupDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-excel-backup-'));
}

export function workbookPath(dir: string, fileName: string): string {
  return join(dir, fileName);
}

/** True when the file exists and carries the xlsx (zip) magic bytes `PK`. */
export function isRealXlsx(path: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path).subarray(0, 2).toString('latin1') === 'PK';
}

export function xlsxSize(path: string): number {
  return statSync(path).size;
}

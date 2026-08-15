import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Black-box fixtures for SOU-116 — `student.setGuardians` partial-update
 * channel. Extends the SOU-42 linking fixtures with the pieces needed to
 * prove the fix's contract: a guardian link/unlink must touch ONLY
 * `guardianIds` (+ sync envelope), never replay-and-revert the student's
 * other fields (name / level / notes / school).
 *
 * Reused as-is from './student-parent-linking.fixtures' (same MAIN_ENTRY,
 * same throwaway admin, same boot recipe, same list/detail navigation):
 * `boot`, `gotoStudents`, `gotoParents`, `createStudent`, `createParent`,
 * `openStudentGuardiansTab`, `openParentDetail`, `linkViaAutocomplete`,
 * `clickUndo`, and the `STR` linking copy.
 *
 * Added here:
 *   - `editStudentField` — drives the top-level "Modifier" dialog on the
 *     student detail page (SOU-39 surface) to change an unrelated field
 *     (name / level / notes / school) through the real UI.
 *   - `findStudentBySearch` / `getStudent` / `simulateConcurrentStudentEdit`
 *     — thin wrappers over the PUBLIC preload bridge (`window.api.invoke`),
 *     the same public contract the app itself uses for IPC. These are used
 *     only to (a) verify persisted field values without relying on visible
 *     copy, and (b) simulate the "stale snapshot" trigger described in the
 *     ticket background (a sync pull / a concurrent edit from another
 *     device/tab landing on the student between the guardian panel mounting
 *     and the guardian action firing) — something no single-window UI
 *     interaction can otherwise force deterministically.
 */

export type StudentRecord = {
  id: string;
  name: { fr: string; ar: string };
  birthDate: string;
  level: string;
  school: string | null;
  notes: string | null;
  guardianIds: string[];
  archived: boolean;
  createdAt: string;
  version: number;
};

/** Student detail "Informations" tab + edit-dialog copy (mirrors SOU-39 i18n keys). */
export const STUDENT_FORM_STR = {
  fr: {
    editBtn: 'Modifier',
    editTitle: "Modifier l'élève",
    tabInfo: 'Informations',
    fields: { nameFr: 'Nom (français)', nameAr: 'Nom (arabe)', birthDate: 'Date de naissance', level: 'Niveau', school: 'École', notes: 'Remarques' },
    save: 'Enregistrer',
    editSuccess: 'Modifications enregistrées',
  },
  ar: {
    editBtn: 'تعديل',
    editTitle: 'تعديل التلميذ',
    tabInfo: 'المعلومات',
    fields: { nameFr: 'الاسم (بالفرنسية)', nameAr: 'الاسم (بالعربية)', birthDate: 'تاريخ الميلاد', level: 'المستوى', school: 'المدرسة', notes: 'ملاحظات' },
    save: 'حفظ',
    editSuccess: 'تم حفظ التعديلات',
  },
} as const;

export type StudentFormLocale = keyof typeof STUDENT_FORM_STR;

/**
 * Open the top-level "Modifier" dialog on an already-open student detail page
 * and change exactly one field (notes / level / school), leaving the others
 * untouched, then save. Asserts the edit-success toast and dialog close.
 * The level field is the SOU-260 niveau select (a combobox), not free text.
 */
export async function editStudentField(
  win: Page,
  L: (typeof STUDENT_FORM_STR)[StudentFormLocale],
  field: 'notes' | 'level' | 'school',
  value: string,
): Promise<void> {
  await win.getByRole('button', { name: L.editBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (field === 'level') {
    await dialog.getByRole('combobox', { name: L.fields.level }).click();
    await win.getByRole('option', { name: niveauName(L, value) }).click();
  } else {
    await dialog.getByLabel(L.fields[field], { exact: false }).fill(value);
  }
  await dialog.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.editSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** The seeded niveau label the level select renders, localized from the STR bundle. */
function niveauName(L: (typeof STUDENT_FORM_STR)[StudentFormLocale], code: string): string {
  const names: Record<string, { fr: string; ar: string }> = {
    '1AC': { fr: '1ère Année Collège', ar: 'السنة الأولى إعدادي' },
    '3AC': { fr: '3ème Année Collège', ar: 'السنة الثالثة إعدادي' },
  };
  const isAr = L.fields.nameFr === 'الاسم (بالفرنسية)';
  return names[code]![isAr ? 'ar' : 'fr']!;
}

/** Fetch the current definition-list values on the (visible) "Informations" tab. */
export async function readInfoTabValue(win: Page, term: string): Promise<string> {
  const dt = win.getByRole('term').filter({ hasText: term });
  const dd = dt.locator('xpath=following-sibling::dd[1]');
  return (await dd.textContent())?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Public preload-bridge helpers (black-box: the same `window.api.invoke`
// surface the renderer itself calls over IPC — not implementation internals).
// ---------------------------------------------------------------------------

type InvokeFn = (channel: string, request: unknown) => Promise<unknown>;

async function apiInvoke<T>(win: Page, channel: string, request: unknown): Promise<T> {
  return win.evaluate(
    async ({ c, r }) => (window as unknown as { api: { invoke: InvokeFn } }).api.invoke(c, r),
    { c: channel, r: request },
  ) as Promise<T>;
}

/** Find a student by name substring via `student.list` (the list-page's own query channel). */
export async function findStudentBySearch(win: Page, search: string): Promise<StudentRecord> {
  const result = await apiInvoke<{ students: StudentRecord[] }>(win, 'student.list', { search });
  const match = result.students[0];
  if (!match) throw new Error(`No student found matching "${search}"`);
  return match;
}

/** Fetch one student's current persisted state via `student.get`. */
export async function getStudent(win: Page, id: string): Promise<StudentRecord> {
  const result = await apiInvoke<{ student: StudentRecord }>(win, 'student.get', { id });
  return result.student;
}

/**
 * Simulate a concurrent edit landing on the student between the guardian
 * panel mounting and a guardian link/unlink firing — e.g. a sync pull, or a
 * second window/device editing the same student. Goes through the same
 * `student.update` full-input channel a genuine second editor would use;
 * only the requested field changes, everything else replays the given
 * snapshot's current values (exactly what a real second editor's own
 * up-to-date form would submit).
 */
export async function simulateConcurrentStudentEdit(
  win: Page,
  base: StudentRecord,
  patch: Partial<Pick<StudentRecord, 'level' | 'notes' | 'school'>>,
): Promise<StudentRecord> {
  const result = await apiInvoke<{ student: StudentRecord }>(win, 'student.update', {
    id: base.id,
    name: base.name,
    birthDate: base.birthDate,
    level: patch.level ?? base.level,
    school: patch.school ?? base.school,
    notes: patch.notes ?? base.notes,
    expectedVersion: base.version,
  });
  return result.student;
}

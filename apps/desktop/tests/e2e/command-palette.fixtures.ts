import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-43 — global command-palette search across people
 * (Ctrl/Cmd+K, header "Rechercher" button; teachers/students/parents grouped
 * by kind; selecting a result navigates to that entity's detail page).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported — copy strings here were read off the running UI (screenshots),
 * exactly as the other black-box suites do.
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

/** Copy observed on the running UI (header trigger, palette input, empty/no-results states, groups). */
export const STR: Record<
  Locale,
  {
    searchTrigger: string; // header button visible label ("Rechercher" / "بحث")
    placeholder: string;
    emptyPrompt: string;
    noResults: (query: string) => string;
    groups: { students: string; teachers: string; parents: string };
    navStudents: string;
    navTeachers: string;
    navParents: string;
    dashboardHeading: string;
  }
> = {
  fr: {
    searchTrigger: 'Rechercher',
    placeholder: 'Rechercher un élève, un enseignant, un parent…',
    emptyPrompt: 'Commencez à taper pour rechercher.',
    noResults: (q) => `Aucun résultat pour « ${q} ».`,
    groups: { students: 'Élèves', teachers: 'Enseignants', parents: 'Parents' },
    navStudents: 'Élèves',
    navTeachers: 'Enseignants',
    navParents: 'Parents',
    dashboardHeading: 'Tableau de bord',
  },
  ar: {
    searchTrigger: 'بحث',
    placeholder: 'ابحث عن تلميذ أو أستاذ أو ولي…',
    emptyPrompt: 'ابدأ الكتابة للبحث.',
    noResults: (q) => `لا نتائج لـ « ${q} ».`,
    groups: { students: 'التلاميذ', teachers: 'الأساتذة', parents: 'الأولياء' },
    navStudents: 'التلاميذ',
    navTeachers: 'الأساتذة',
    navParents: 'أولياء الأمور',
    dashboardHeading: 'لوحة القيادة',
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-cmdk-'));
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
 * Launch and get past the first-run + auth gates into the shell: seed the admin
 * through the public bridge, establish a remembered session, reload so the gates
 * pass and the shell renders. Same recipe the other suites use.
 *
 * Waits for the dashboard heading after reload — without it, the very first
 * Ctrl/Cmd+K press right after `reload()` occasionally lands before the
 * shell's global keydown listener is attached and gets dropped (observed
 * ~1-in-8 in a tight loop), which is a test-timing race, not a product bug.
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
  await expect(live.win.getByRole('heading', { level: 1, name: STR[locale].dashboardHeading })).toBeVisible();
  return live;
}

export type CreatedId = { id: string };

type Bridge = { invoke: (channel: string, request: unknown) => Promise<unknown> };

/** Seed one subject (prerequisite for teachers) via the public bridge. */
export async function createSubject(win: Page, nameFr: string, nameAr: string): Promise<CreatedId> {
  return win.evaluate(
    async ({ nameFr, nameAr }) => {
      const api = (window as unknown as { api: Bridge }).api;
      return (await api.invoke('subject.create', { name: { fr: nameFr, ar: nameAr } })) as { id: string };
    },
    { nameFr, nameAr },
  );
}

/** Seed one teacher (bilingual name, like Student). */
export async function createTeacher(
  win: Page,
  opts: { nameFr: string; nameAr: string; phone: string; subjectIds?: readonly string[] },
): Promise<CreatedId> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    return (await api.invoke('teacher.create', {
      name: { fr: o.nameFr, ar: o.nameAr },
      phone: o.phone,
      subjectIds: o.subjectIds ?? [],
    })) as { id: string };
  }, opts);
}

/** Seed one parent — Parent.name is a single string (unlike Student/Teacher's bilingual name). */
export async function createParent(
  win: Page,
  opts: { name: string; phone: string; relation?: 'pere' | 'mere' | 'tuteur' | 'autre' },
): Promise<CreatedId> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    return (await api.invoke('parent.create', {
      name: o.name,
      phone: o.phone,
      relation: o.relation ?? 'pere',
    })) as { id: string };
  }, opts);
}

/** Seed one student (bilingual name). */
export async function createStudent(
  win: Page,
  opts: { nameFr: string; nameAr: string; level?: string; guardianIds?: readonly string[] },
): Promise<CreatedId> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    return (await api.invoke('student.create', {
      name: { fr: o.nameFr, ar: o.nameAr },
      birthDate: '2010-05-14',
      level: o.level ?? '3AC',
      school: null,
      notes: null,
      guardianIds: o.guardianIds ?? [],
    })) as { id: string };
  }, opts);
}

/**
 * Open the palette via the documented Ctrl/Cmd+K shortcut, and wait for the
 * search input to actually hold focus before returning — without this, fast
 * `keyboard.type()` calls right after the chord can race the dialog's mount
 * and drop the first characters typed.
 */
export async function openPaletteViaShortcut(win: Page, chord: 'Control+k' | 'Meta+k' = 'Control+k'): Promise<void> {
  await win.keyboard.press(chord);
  await paletteInput(win).waitFor({ state: 'visible' });
  await expect(paletteInput(win)).toBeFocused();
}

/** Open the palette via the visible header search-trigger button, same focus guarantee as the shortcut. */
export async function openPaletteViaButton(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('button', { name: L.searchTrigger }).click();
  await paletteInput(win).waitFor({ state: 'visible' });
  await expect(paletteInput(win)).toBeFocused();
}

/**
 * Scoped to the palette's own combobox so it stays unambiguous once a result
 * selection opens a second `role="dialog"` (e.g. the parent detail sheet,
 * Scenario 7c) — a plain `getByRole('dialog')` would match both.
 */
export function paletteDialog(win: Page) {
  return win.getByRole('dialog').filter({ has: win.getByRole('combobox') });
}

export function paletteInput(win: Page) {
  return win.getByRole('combobox');
}

export function paletteOptions(win: Page) {
  return win.getByRole('option');
}

/** cmdk stamps each result `data-value="{kind}:{id}"` — read straight off the DOM. */
export function paletteOptionByKind(win: Page, kind: 'student' | 'teacher' | 'parent'): Locator {
  return win.locator(`[cmdk-item][data-value^="${kind}:"]`);
}

export async function groupHeadings(win: Page): Promise<string[]> {
  return win.evaluate(() => Array.from(document.querySelectorAll('[cmdk-group-heading]')).map((h) => h.textContent ?? ''));
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

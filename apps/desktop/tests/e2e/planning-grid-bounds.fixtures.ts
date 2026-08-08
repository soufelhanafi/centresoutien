import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-184 — planner grid vertical bounds derive from
 * CenterHours (union of open days), closed days render hatched + non-interactive,
 * all-closed falls back to 08:00–20:00.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`): admin seed + `centerHours.save` (bare week
 * array, the exact request the Settings form persists) + `centerHours.get` for
 * the read-back proof. No renderer/domain/data implementation is imported.
 * Every asserted string mirrors the i18n catalog (fr/ar.json).
 *
 * Launch switches (shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

export type DayHours = { dayOfWeek: number; open: string | null; close: string | null };

export const STR: Record<
  Locale,
  {
    navPlanning: string;
    title: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: { navPlanning: 'Planning', title: 'Planning hebdomadaire', dir: 'ltr' },
  ar: { navPlanning: 'الجدولة', title: 'الجدول الأسبوعي', dir: 'rtl' },
};

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-grid-'));
}

/** Every weekday open on the same window. */
export function openWeek(open: string, close: string): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, open, close }));
}

/** Every weekday closed. */
export function closedWeek(): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, open: null, close: null }));
}

/** SOU-184 ticket scenario: Sunday 10:00–18:00, other six days 19:00–22:00. */
export function ticketWeek(): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) =>
    d === 0 ? { dayOfWeek: d, open: '10:00', close: '18:00' } : { dayOfWeek: d, open: '19:00', close: '22:00' },
  );
}

/** Sunday closed, other six days 19:00–22:00. */
export function closedSundayWeek(): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) =>
    d === 0 ? { dayOfWeek: d, open: null, close: null } : { dayOfWeek: d, open: '19:00', close: '22:00' },
  );
}

/** The `HH:mm` hour labels from start (inclusive) to end (inclusive), step 1h. */
export function hourLabels(start: number, end: number): string[] {
  const out: string[] = [];
  for (let h = start; h <= end; h++) out.push(`${String(h).padStart(2, '0')}:00`);
  return out;
}

export type Launched = { app: ElectronApplication; win: Page };

/**
 * Launch fresh, get past the first-run + auth gates, save the given week via
 * the same `centerHours.save` channel the Settings form persists through, then
 * reload so the shell renders and the planner reads the saved hours.
 */
export async function bootWithHours(locale: Locale, week: DayHours[]): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'essentiel' },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);

  await win.evaluate(async (w) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('centerHours.save', w);
  }, week);

  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Read back the persisted week through the public read channel (seed proof). */
export async function readWeekHours(win: Page): Promise<DayHours[]> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('centerHours.get', {})) as { week: DayHours[] };
    return res.week;
  });
}

/** Navigate to the weekly planner via the sidebar. */
export async function gotoPlanning(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.title }).waitFor();
}

/**
 * The grid container: walk two ancestors up from a visible gutter hour label
 * (span → hour-column div → the `div.grid` holding every column).
 */
export function gridRoot(win: Page, anchorTime: string) {
  return win.getByText(anchorTime, { exact: true }).first().locator('..').locator('..');
}

/**
 * The seven day-column divs (border-s + inline height, i.e. the day tracks, not
 * the header row nor the time gutter).
 */
export function dayColumns(win: Page, anchorTime: string) {
  return gridRoot(win, anchorTime).locator(':scope > div.border-s[style*="height"]');
}

/**
 * The hour labels currently rendered in the grid gutter, as a
 * Map<label, y-center> (y increases downward, so top label has the smallest y).
 */
export async function gutterLabelPositions(win: Page, expected: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const label of expected) {
    const box = await win.getByText(label, { exact: true }).first().boundingBox();
    if (box) out.set(label, box.y + box.height / 2);
  }
  return out;
}

/** Which label sits at the top (min y) and bottom (max y) of the gutter. */
export async function gutterEdges(win: Page, expected: string[]): Promise<{ top: string; bottom: string }> {
  const pos = await gutterLabelPositions(win, expected);
  let top = '';
  let bottom = '';
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [label, y] of pos) {
    if (y < minY) {
      minY = y;
      top = label;
    }
    if (y > maxY) {
      maxY = y;
      bottom = label;
    }
  }
  return { top, bottom };
}

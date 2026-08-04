import { test, expect } from '@playwright/test';
import { boot, gotoPlanning, readWeek, createSessionViaBridge, STR, type Launched, type Locale } from './planning-sessions.fixtures';
import {
  openGenerator,
  GENERATOR_STR,
  switchGeneratorMode,
  toggleWeekdayButton,
  fillGeneratorDateRange,
  submitGeneratorConfig,
  generatorCloseButton,
} from './session-generator.fixtures';

/**
 * SOU-159 — AC2 through AC7: the two-step config → preview → commit flow of
 * the "Générer des séances" popup.
 *
 * The FormLabel-outside-FormField crash that previously blocked every
 * scenario past dialog-open is fixed on this branch (commit f0ac6f6). AC2/AC3
 * cover the open-without-crashing precondition; AC4–AC7 now drive the real
 * config → preview → commit flow end-to-end.
 */

const locale = () => test.info().project.name as Locale;

type SeededRoom = { id: string; name: string };
type SeededTeacher = { id: string; nameFr: string; nameAr: string };
type SeededGroup = { id: string; level: string };

let live: (Launched & { seeded: { rooms: SeededRoom[]; teachers: SeededTeacher[]; groups: SeededGroup[] } }) | null = null;
const pageErrors: Error[] = [];

test.afterEach(async () => {
  await live?.app.close();
  live = null;
  pageErrors.length = 0;
});

async function bootAndSeed(plan: 'pro' | 'premium') {
  const L = STR[locale()];
  live = await boot(
    locale(),
    {
      rooms: [{ name: 'Salle A' }, { name: 'Salle B' }],
      teachers: [{ nameFr: 'Prof Karim', nameAr: 'الأستاذ كريم', phone: '+212600112233' }],
      groups: [{ level: 'Groupe A' }],
    },
    plan,
  );
  const win = live.win;
  win.on('pageerror', (err) => pageErrors.push(err));
  await gotoPlanning(win, L);
  return { L, win };
}

/** Fills the minimum valid Custom-mode config: one picked weekday + a dated range. */
async function fillMinimumCustomConfig(dialog: ReturnType<typeof getDialog>, G: (typeof GENERATOR_STR)[Locale], weekdayName: string) {
  await switchGeneratorMode(dialog, G, 'custom');
  await toggleWeekdayButton(dialog, G.pickedWeekdaysGroupLabel, weekdayName);
  await fillGeneratorDateRange(dialog, '2026-08-10', '2026-08-24'); // three Mondays: 10, 17, 24
}

function getDialog(win: Launched['win']) {
  return win.getByRole('dialog');
}

/** Seeds a holiday through the same public write channel the Holidays screen uses. */
async function seedHoliday(win: Launched['win'], date: string): Promise<void> {
  await win.evaluate(async (d) => {
    const api = (window as unknown as { api: { invoke: (channel: string, req: unknown) => Promise<unknown> } }).api;
    await api.invoke('holiday.create', {
      name: { fr: 'Jour test', ar: 'يوم اختبار' },
      kind: 'fixed',
      startDate: d,
      endDate: d,
    });
  }, date);
}

// ---------------------------------------------------------------------------
// AC2 — Pro plan: open the dialog, expect Custom mode usable / Auto locked.
// ---------------------------------------------------------------------------
test('AC2 (Pro) — opening the generator dialog does not crash the planner', async () => {
  const { win } = await bootAndSeed('pro');
  const outcome = await openGenerator(win, locale());

  if (outcome === 'crashed') {
    await win.screenshot({ path: `test-results/session-generator-crash-pro-${locale()}.png`, fullPage: true });
  }
  expect(
    outcome,
    `Generator dialog did not open on Pro plan; renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`,
  ).toBe('dialog');
});

// ---------------------------------------------------------------------------
// AC3 — Premium plan: Auto mode usable with a sessions-per-week count.
// ---------------------------------------------------------------------------
test('AC3 (Premium) — opening the generator dialog does not crash the planner', async () => {
  const { win } = await bootAndSeed('premium');
  const outcome = await openGenerator(win, locale());

  if (outcome === 'crashed') {
    await win.screenshot({ path: `test-results/session-generator-crash-premium-${locale()}.png`, fullPage: true });
  }
  expect(
    outcome,
    `Generator dialog did not open on Premium plan; renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`,
  ).toBe('dialog');
});

// ---------------------------------------------------------------------------
// AC4 — preview is read-only: the config form is not editable once the
// preview step is showing, and closing the dialog without clicking the final
// "Générer les séances" / "توليد الحصص" commit action persists nothing.
// ---------------------------------------------------------------------------
test('AC4 (Premium) — preview is read-only and cancel-after-preview creates nothing', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win } = await bootAndSeed('premium');
  expect(await readWeek(win)).toHaveLength(0);

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = getDialog(win);

  await fillMinimumCustomConfig(dialog, G, L.weekdays[1]!); // Lundi / الإثنين
  await submitGeneratorConfig(dialog, G);

  // Read-only: the preview step hides the config form entirely — none of its
  // inputs are visible/editable while the preview is showing.
  await expect(dialog.locator('input[name="startDate"]')).toBeHidden();
  await expect(dialog.getByRole('group', { name: G.pickedWeekdaysGroupLabel })).toBeHidden();
  await expect(dialog.getByRole('button', { name: G.commitAction, exact: true })).toBeVisible();

  // Cancel via the dialog's close ("X") control, NOT the commit action.
  await generatorCloseButton(dialog).click();
  await expect(dialog).toBeHidden();

  expect(await readWeek(win)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// AC5 — a colliding config surfaces a flagged (non-blocking) conflict in the
// preview; the warning never hides or auto-skips the proposal, and commit is
// still the admin's call, not disabled. But per `SessionGeneratorGateway`'s
// documented contract, commit re-runs the composite conflict check against
// the LIVE schedule (never trusting a possibly-stale preview) — so when the
// seeded conflict is still live at commit time, the write is correctly
// rejected with the same inline `errors.room-conflict` toast the manual
// create-session flow uses (see `planning-session-conflicts.spec.ts`), and
// nothing is persisted. This is the intended behavior, not a silent no-op:
// the toast renders outside the dialog's DOM subtree via a portal, which is
// why an earlier pass mistook the (correct) rejection for one.
// ---------------------------------------------------------------------------
test('AC5 (Premium) — room collision is flagged in preview and correctly rejected on commit', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win } = await bootAndSeed('premium');
  const [roomA, roomB] = live!.seeded.rooms;

  // Pre-book BOTH seeded rooms on Monday 09:00-10:30 — the generator's room
  // assignment for a fresh center is not pinned to the group's configured
  // room (confirmed by direct exploration: it varied between runs), so both
  // candidates must be occupied to force a guaranteed collision regardless
  // of which room the engine picks.
  await createSessionViaBridge(win, { roomId: roomA!.id, dayOfWeek: 1, start: '09:00', end: '10:30' });
  await createSessionViaBridge(win, { roomId: roomB!.id, dayOfWeek: 1, start: '09:00', end: '10:30' });

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = getDialog(win);

  await fillMinimumCustomConfig(dialog, G, L.weekdays[1]!);
  await submitGeneratorConfig(dialog, G);

  const conflictBanner = G.preview.conflictsBanner.replace('{{count}}', '1');
  await expect(dialog.getByText(conflictBanner)).toBeVisible();

  // Expand the proposal to confirm the per-block warning is the room clash,
  // not some other unrelated conflict.
  await dialog.locator('summary').first().click();
  const roomWarning = new RegExp(G.warnings.room.replace('{{room}}', '.+').replace('{{day}}', '.+'));
  await expect(dialog.getByText(roomWarning)).toBeVisible();

  // The warning was surfaced BEFORE commit is reachable — commit is still a
  // human decision (non-blocking warning), not a silent auto-skip. Attempting
  // it against a still-live conflict is correctly rejected, not silently
  // dropped: an inline error toast fires and nothing is persisted.
  const before = await readWeek(win);
  await dialog.getByRole('button', { name: G.commitAction, exact: true }).click();
  await expect(win.getByText(L.errors.roomConflict)).toBeVisible();
  await expect(dialog).toBeVisible();
  const after = await readWeek(win);
  expect(after.length).toBe(before.length);
});

// ---------------------------------------------------------------------------
// AC6 — a date range spanning a holiday skips that date and the commit
// toast reports the skipped count.
// ---------------------------------------------------------------------------
test('AC6 (Premium) — holiday-spanning range skips + reports skipped count on commit', async () => {
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win } = await bootAndSeed('premium');

  // 2026-08-17 is a Monday inside the 2026-08-10..2026-08-24 range used by
  // fillMinimumCustomConfig (which covers Mondays 10, 17, 24).
  await seedHoliday(win, '2026-08-17');

  const outcome = await openGenerator(win, locale());
  expect(outcome, `renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`).toBe('dialog');
  const dialog = getDialog(win);

  await fillMinimumCustomConfig(dialog, G, L.weekdays[1]!);
  await submitGeneratorConfig(dialog, G);

  await dialog.getByRole('button', { name: G.commitAction, exact: true }).click();

  await expect(win.getByText(G.commitSkipped.replace('{{count}}', '1'))).toBeVisible();
  await expect(win.getByText(G.commitSuccess.replace('{{count}}', '1'))).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC7 — AR/RTL rendering of the dialog itself.
// ---------------------------------------------------------------------------
test('AC7 (AR/RTL, Premium) — generator dialog renders RTL-mirrored', async () => {
  test.skip(locale() !== 'ar', 'AR-only scenario');
  const L = STR[locale()];
  const G = GENERATOR_STR[locale()];
  const { win } = await bootAndSeed('premium');
  const outcome = await openGenerator(win, 'ar');
  if (outcome === 'crashed') {
    await win.screenshot({ path: `test-results/session-generator-crash-ar-rtl.png`, fullPage: true });
  }
  expect(
    outcome,
    `Generator dialog did not open in AR locale; renderer errors: ${pageErrors.map((e) => e.message).join(' | ')}`,
  ).toBe('dialog');
  const dialog = getDialog(win);

  // `dir="rtl"` propagates from <html> down into the dialog's computed style
  // (CLAUDE.md §8: enforced once on <html>, never per-component).
  const direction = await dialog.evaluate((el) => getComputedStyle(el).direction);
  expect(direction).toBe('rtl');

  // DOM order of the weekday pool is NOT reversed (Sunday→Saturday, same as
  // FR) — RTL mirroring is purely visual, via `dir`, per CLAUDE.md §8.
  const weekdayGroup = dialog.getByRole('group', { name: G.weekdayPoolGroupLabel });
  const domOrderNames = await weekdayGroup.getByRole('button').allTextContents();
  expect(domOrderNames).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => L.weekdays[d]));

  // Visual mirroring: the first weekday in DOM order (Sunday) renders
  // further to the RIGHT than the last (Saturday) — the flex row visually
  // reverses under dir="rtl" even though the DOM order above is unchanged.
  const buttons = weekdayGroup.getByRole('button');
  const firstBox = await buttons.first().boundingBox();
  const lastBox = await buttons.last().boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(firstBox!.x).toBeGreaterThan(lastBox!.x);

  // Mode toggle: DOM order unchanged (Automatique/تلقائي first, Manuel/يدوي
  // second) but visually the first DOM button renders on the right.
  const modeGroup = dialog.getByRole('group', { name: G.mode.label });
  const modeNames = await modeGroup.getByRole('button').allTextContents();
  expect(modeNames).toEqual([G.mode.auto, G.mode.custom]);
  const modeButtons = modeGroup.getByRole('button');
  const autoBox = await modeButtons.first().boundingBox();
  const manualBox = await modeButtons.last().boundingBox();
  expect(autoBox!.x).toBeGreaterThan(manualBox!.x);

  // The dialog's close ("X") control sits at the logical "end" (CSS
  // `end-4`), which mirrors to the LEFT edge in RTL instead of the right.
  const dialogBox = await dialog.boundingBox();
  const closeBox = await generatorCloseButton(dialog).boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  const dialogMidX = dialogBox!.x + dialogBox!.width / 2;
  expect(closeBox!.x).toBeLessThan(dialogMidX);

  // BUG (frontend, i18n): every other DialogContent in this codebase passes
  // closeLabel={t(...)} to translate the close button's accessible name
  // (sr-only span) — session-generator-dialog.tsx does not, so it renders
  // the French default "Fermer" even when the app is running in Arabic.
  await expect(dialog.getByRole('button', { name: 'Fermer', exact: true })).toHaveCount(0);
});

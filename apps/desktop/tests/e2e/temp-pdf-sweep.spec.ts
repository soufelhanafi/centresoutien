import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import {
  TMP_DIR,
  seedTempFile,
  tempFileExists,
  isRealPdf,
  cleanupSeeded,
  seeded,
  listOwnedTempPdfs,
  OWNED_PREFIXES,
} from './temp-pdf-sweep.fixtures';
import { launch, boot, gotoPlanning, createSessionViaBridge, freshUserDataDir, STR, type Locale, type Launched } from './planning-sessions.fixtures';
import { stubOpenPath, EXPORT_STR, pageCrashed } from './schedule-export.fixtures';

/**
 * SOU-163 — temp-PDF lifecycle. Every `*.print` action writes a PDF into the OS
 * temp dir (prefixes `planning-`, `facture-`, `bulletin-paie-`, `recu-paiement-`)
 * and hands it to the external viewer; the startup sweep deletes only OUR stale
 * (mtime > 5 min) temp PDFs, never foreign files.
 *
 * Black-box: only the running packaged app and the OS temp dir are observed.
 * Runs under both the `fr` and `ar` projects (the change is NOT RTL-sensitive —
 * the `ar` runs are incidental, the copy under test is parameterized).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close().catch(() => undefined);
  live = null;
  cleanupSeeded();
});

const STALE_AGE_MIN = 6; // comfortably older than the 5-minute sweep threshold
const tag = () => `${Date.now()}-${locale()}`;

// ---------------------------------------------------------------------------
// AC1 — stale owned temp PDFs do not survive. One file per owned prefix, all
// backdated past the 5-minute threshold: after a fresh boot every one is gone.
// ---------------------------------------------------------------------------
test('AC1 — stale owned temp PDFs (all four prefixes) are swept at startup', async () => {
  const t = tag();
  const names = OWNED_PREFIXES.map((p) => `${p}qa-stale-${t}.pdf`);
  for (const n of names) seedTempFile(n, STALE_AGE_MIN);
  for (const n of names) expect(tempFileExists(n), `seed precondition ${n}`).toBe(true);

  live = await launch(locale(), 'premium', freshUserDataDir());
  const win = live.win;
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2500);

  for (const n of names) expect(tempFileExists(n), `stale owned temp PDF ${n} must be swept`).toBe(false);
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC1 / AC2 — a just-printed (fresh, < 5 min) owned temp PDF survives startup,
// so the external viewer is never handed a file that was already deleted.
// ---------------------------------------------------------------------------
test('AC1/AC2 — a fresh owned temp PDF survives startup (no premature deletion)', async () => {
  const n = `planning-qa-fresh-${tag()}.pdf`;
  seedTempFile(n, 0);
  expect(tempFileExists(n)).toBe(true);

  live = await launch(locale(), 'premium', freshUserDataDir());
  const win = live.win;
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2500);

  expect(tempFileExists(n), `fresh owned temp PDF ${n} must survive the startup sweep`).toBe(true);
});

// ---------------------------------------------------------------------------
// AC1 — foreign files are never touched: a non-owned `.pdf` and an owned-prefix
// non-PDF (`.txt`) both survive a boot, even when stale.
// ---------------------------------------------------------------------------
test('AC1 — foreign files (non-owned pdf, owned-prefix non-pdf) are never touched', async () => {
  const t = tag();
  const foreignPdf = `unknown-qa-${t}.pdf`;
  const ownedPrefixTxt = `planning-qa-notes-${t}.txt`;
  seedTempFile(foreignPdf, STALE_AGE_MIN);
  seedTempFile(ownedPrefixTxt, STALE_AGE_MIN);
  expect(tempFileExists(foreignPdf)).toBe(true);
  expect(tempFileExists(ownedPrefixTxt)).toBe(true);

  live = await launch(locale(), 'premium', freshUserDataDir());
  const win = live.win;
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(2500);

  expect(tempFileExists(foreignPdf), `foreign ${foreignPdf} must be untouched`).toBe(true);
  expect(tempFileExists(ownedPrefixTxt), `non-PDF ${ownedPrefixTxt} must be untouched`).toBe(true);
});

// ---------------------------------------------------------------------------
// AC2 / AC3 — the schedule print flow still completes: no error toast, no page
// crash, and a real `%PDF` file with the `planning-` prefix is produced in the
// OS temp dir (the same artifact the sweep later governs).
// ---------------------------------------------------------------------------
test('AC2/AC3 — schedule print still completes and produces a fresh real temp PDF', async () => {
  const L = EXPORT_STR[locale()];
  const loc = locale();
  live = await boot(loc, {
    rooms: [{ name: 'Salle A' }],
    teachers: [{ nameFr: 'Prof Un', nameAr: 'أستاذ واحد', phone: '+212600000001' }],
    groups: [{ level: '3AC', kind: 'regular' }],
  });
  const { win, app } = live;
  await createSessionViaBridge(win, {
    roomId: live.seeded.rooms[0]!.id,
    teacherId: live.seeded.teachers[0]!.id,
    groupId: live.seeded.groups[0]!.id,
    dayOfWeek: 1,
    start: '09:00',
    end: '10:00',
  });
  await stubOpenPath(app);
  await gotoPlanning(win, STR[loc]);

  const before = new Set(listOwnedTempPdfs().map((f) => f.name));
  await win.getByRole('button', { name: L.trigger }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: L.print, exact: true }).click();
  await win.waitForTimeout(1500);

  const produced = listOwnedTempPdfs().filter((f) => !before.has(f.name));
  expect(produced.length, 'a new planning-*.pdf must appear in the OS temp dir after Print').toBeGreaterThan(0);
  const newest = produced[0]!;
  expect(newest.name.startsWith('planning-'), `produced file ${newest.name} must use the planning- prefix`).toBe(true);
  expect(isRealPdf(join(TMP_DIR, newest.name)), `produced ${newest.name} must be a real %PDF`).toBe(true);
  seeded.push(join(TMP_DIR, newest.name));

  await expect(win.getByText(L.printError)).toHaveCount(0);
  expect(await pageCrashed(win)).toBe(false);
});

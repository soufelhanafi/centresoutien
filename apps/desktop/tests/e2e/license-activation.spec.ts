import { test, expect, type Page } from '@playwright/test';
import {
  LIC,
  DIRECTION,
  ENVELOPES,
  GARBAGE_KEY,
  freshUserDataDir,
  launch,
  seedConfiguredCenter,
  licenseStatus,
  type Launched,
  type Locale,
} from './license-activation.fixtures';

/**
 * SOU-104 — License activation & restricted-mode HARD LOCK (black-box).
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * See the fixtures header for the verified injection reality that makes every
 * signature-VALID acceptance state unreachable on the packaged build — those are
 * `test.skip`ped with their reason and covered by domain unit + integration tests.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const gateTitle = (win: Page, L: Record<string, string>) => win.getByText(L.title, { exact: true }).first();

/** The gate is a hard lock: no app shell, no skip control. Assert unreachability. */
async function assertHardLocked(win: Page, L: Record<string, string>): Promise<void> {
  await expect(gateTitle(win, L)).toBeVisible();
  await expect(win.getByRole('button', { name: L.skip })).toHaveCount(0);
  await expect(win.getByText(L.appMarker)).toHaveCount(0);
  await expect(win.getByRole('button', { name: L.logout })).toHaveCount(0);
  await expect(win.getByRole('link', { name: L.dashboard })).toHaveCount(0);
}

// ── S1 · Missing license → hard-lock activation screen ────────────────────────
test('S1 — configured center + missing license → hard-locked activation screen', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale()); // no license file
  const win = live.win;

  const status = await licenseStatus(win);
  expect(status.status).toBe('missing');
  expect(status.restricted).toBe(true);
  expect(status.plan).toBe('essentiel');

  await assertHardLocked(win, L);
  await expect(win.getByText(L.restrictedTitle, { exact: true })).toBeVisible();
  await expect(win.getByRole('button', { name: L.import })).toBeVisible();
  await expect(win.getByRole('button', { name: L.activate })).toBeVisible();
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);

  await win.screenshot({ path: `test-results/sou104-S1-missing-hardlock-${locale()}.png` });
});

// ── S2 · Tampered (forged-signature) license → hard-lock, correctly labelled ──
test('S2 — tampered license → hard lock, labelled "invalid signature", never crashes', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: ENVELOPES.valid() }); // valid shape, throwaway signature
  const win = live.win;

  const status = await licenseStatus(win);
  expect(status.status).toBe('invalid-signature');
  expect(status.restricted).toBe(true);

  await assertHardLocked(win, L);
  await expect(win.getByText(L.statusInvalid, { exact: true })).toBeVisible(); // not mislabelled as "no license"
  await win.screenshot({ path: `test-results/sou104-S2-tampered-hardlock-${locale()}.png` });
});

// ── S3 · Invalid key via the activation form → translated rejection, stays locked
test('S3 — pasting a garbage / non-vendor key → translated invalid-signature error, plan unchanged', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale());
  const win = live.win;
  await expect(gateTitle(win, L)).toBeVisible();

  await win.getByRole('textbox').first().fill(GARBAGE_KEY);
  await win.getByRole('button', { name: L.activate }).click();

  await expect(win.getByText(L.reasonInvalid)).toBeVisible();
  await assertHardLocked(win, L); // rejection keeps the gate; no dismiss into the app
  expect((await licenseStatus(win)).plan).toBe('essentiel'); // nothing was written

  await win.screenshot({ path: `test-results/sou104-S3-invalid-form-${locale()}.png` });
});

// ── S4 · No feature is reachable while restricted (UI hard lock) ──────────────
test('S4 — no navigation / feature UI is reachable while restricted', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: ENVELOPES.expired() }); // still invalid-signature → restricted
  const win = live.win;

  await assertHardLocked(win, L);
  // Only the language toggle, Import and Activer controls exist on the gate.
  const buttons = await win.getByRole('button').allInnerTexts();
  const featureButtons = buttons.filter((t) => t.includes(L.logout) || t.includes(L.dashboard));
  expect(featureButtons).toHaveLength(0);
});

// ── S5 · First-run wizard is reachable (activation comes AFTER the wizard) ─────
test('S5 — fresh install shows the first-run wizard, not the gate (activation is post-wizard)', async () => {
  const L = LIC[locale()];
  live = await launch(freshUserDataDir(), locale()); // truly fresh: no admin, no license
  const win = live.win;
  expect((await licenseStatus(win)).restricted).toBe(true);
  await expect(win.getByText(L.wizardTitle, { exact: true })).toBeVisible();
  await expect(gateTitle(win, L)).toHaveCount(0);
});

// ── S6 · Per-center license file isolation (M2) ───────────────────────────────
// The license is scoped to `license.<centerCode>.json`; the remembered admin
// session lives in the shared laptop DB, so seeding runs once and only the
// centerCode (hence the license file it resolves) changes between launches.
test('S6 — per-center license is isolated: center B does not see center A’s file', async () => {
  const dir = freshUserDataDir();
  const A = 'CS-AAA-001';
  const B = 'CS-BBB-002';

  await seedConfiguredCenter(dir, locale(), A);
  live = await launch(dir, locale(), { center: A, license: ENVELOPES.valid() }); // writes license.CS-AAA-001.json
  expect((await licenseStatus(live.win)).status).toBe('invalid-signature');
  await live.app.close();

  // Same laptop dir (same admin/session), switch to center B — its own license
  // file was never written, so B must resolve to `missing`, unaffected by A.
  live = await launch(dir, locale(), { center: B }); // no license.CS-BBB-002.json
  const bStatus = await licenseStatus(live.win);
  expect(bStatus.status).toBe('missing'); // B sees ITS OWN (missing) license, unaffected by A
  expect(bStatus.restricted).toBe(true);
});

// ── BLOCKED · signature-VALID acceptance states (not black-box injectable) ────
// The packaged build embeds a placeholder vendor key (no private key committed)
// and tree-shakes the DEV CS_LICENSE_PUBLIC_KEY override, so no signature-valid
// license can be produced or activated in E2E. Verified by runtime probe. These
// are covered by domain unit + integration tests instead.
const BLOCKED =
  'Not black-box verifiable on the packaged build: placeholder vendor key + ' +
  'DEV key-override tree-shaken → no signature-valid license can be injected. ' +
  'Covered by domain unit + integration tests.';
const blocked = (name: string) =>
  test.skip(name, () => {
    test.info().annotations.push({ type: 'blocked', description: BLOCKED });
  });

blocked('S7 — valid license → activated, shows plan + centers allowed (read-only)');
blocked('S8 — expired genuine license → hard-locked "expired" state');
blocked('S9 — wrong-machine / wrong-center genuine license → hard-locked mismatch state');
blocked('S10 — expired founder-discount metadata → banner, plan unchanged');
blocked('S11 — re-activation upgrade Essentiel → Pro → Premium from Settings');
blocked('S12 — Settings › Licence entry point (only reachable once a valid license is active)');
blocked('S13 — per-center VALID activation isolation (activate A active → B still restricted)');

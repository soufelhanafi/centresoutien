import { test, expect, type Page } from '@playwright/test';
import {
  LIC,
  DIRECTION,
  ENVELOPES,
  SIGNED,
  GARBAGE_KEY,
  freshUserDataDir,
  launch,
  seedConfiguredCenter,
  gotoLicenseSettings,
  activateViaForm,
  licenseStatus,
  type Launched,
  type Locale,
} from './license-activation.fixtures';

/**
 * SOU-104 / SOU-172 — License activation & restricted-mode HARD LOCK (black-box).
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * SOU-172 added a production-surviving, `__CS_E2E__`-gated trust-anchor seam and a
 * committed test keypair, so the signature-VALID acceptance states (S7–S13) that
 * were previously `test.skip`ped are now black-box reachable on the dedicated
 * e2e build. See the fixtures header for how the trust anchor is injected.
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
  const after = await licenseStatus(win);
  expect(after.status).toBe('missing'); // rejected key was never persisted
  expect(after.plan).toBe('essentiel'); // nothing was written

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

// ── S5 · New center setup starts a usable trial ───────────────────────────────
test('S5 — new center setup starts a trial and opens the app without a license', async () => {
  const L = LIC[locale()];
  live = await launch(freshUserDataDir(), locale()); // truly fresh: no admin, no license
  const win = live.win;
  expect((await licenseStatus(win)).restricted).toBe(true);
  await expect(win.getByText(L.wizardTitle, { exact: true })).toBeVisible();
  await expect(gateTitle(win, L)).toHaveCount(0);

  await win.getByRole('radio').first().check();
  await win.getByRole('button', { name: L.wizardNext }).click();
  await expect(win.getByText(L.wizardCenterTitle, { exact: true })).toBeVisible();
  await win.getByLabel(L.wizardCenterName, { exact: true }).fill(L.appMarker);
  await win.getByLabel(L.wizardCenterPhone, { exact: true }).fill('+212612345678');
  await win.getByRole('button', { name: L.wizardNext }).click();

  const trial = await licenseStatus(win);
  expect(trial.status).toBe('trial-active');
  expect(trial.restricted).toBe(false);
  expect(trial.trial).not.toBeNull();

  await expect(win.getByText(L.wizardAdminTitle, { exact: true })).toBeVisible();
  await win.getByLabel(L.wizardUsername, { exact: true }).fill(ADMIN.username);
  await win.getByLabel(L.wizardPassword, { exact: true }).fill(ADMIN.password);
  await win.getByLabel(L.wizardConfirmPassword, { exact: true }).fill(ADMIN.password);
  await win.getByRole('button', { name: L.wizardNext }).click();
  await win.getByRole('button', { name: /Commencer|ابدأ/ }).click();
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, ADMIN);
  await win.reload();
  await expect(win.getByText(L.appMarker).first()).toBeVisible();
  await gotoLicenseSettings(win, locale());
  await expect(win.getByText(L.statusTrialActive, { exact: true })).toBeVisible();
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

// ── signature-VALID acceptance states — reachable via the SOU-172 e2e seam ────

// ── S7 · Valid license → active, app reachable, plan + centers shown read-only
test('S7 — valid license → activated, shows plan + centers allowed (read-only)', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: SIGNED.valid({ plan: 'premium', centersAllowed: 3 }) });
  const win = live.win;

  const status = await licenseStatus(win);
  expect(status.status).toBe('active');
  expect(status.restricted).toBe(false);
  expect(status.plan).toBe('premium');
  expect(status.centersAllowed).toBe(3);

  // The gate opened: the app shell — not the activation screen — is on screen.
  await expect(win.getByText(L.appMarker).first()).toBeVisible();
  await expect(win.getByText(L.title, { exact: true })).toHaveCount(0);

  // Settings › Licence shows the current plan + centers allowed, read-only.
  await gotoLicenseSettings(win, locale());
  await expect(win.getByText(L.statusActive, { exact: true })).toBeVisible();
  await expect(win.getByText('PREMIUM', { exact: true })).toBeVisible();
  await expect(win.getByText(L.centersAllowedLabel, { exact: true })).toBeVisible();

  await win.screenshot({ path: `test-results/sou104-S7-valid-active-${locale()}.png` });
});

// ── S8 · Genuinely expired license (real signature) → hard-lock "expired" ─────
test('S8 — expired genuine license → hard-locked "expired" state', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: SIGNED.expired() });
  const win = live.win;

  const status = await licenseStatus(win);
  expect(status.status).toBe('expired');
  expect(status.restricted).toBe(true);

  await assertHardLocked(win, L);
  await expect(win.getByText(L.statusExpired, { exact: true })).toBeVisible();
  await win.screenshot({ path: `test-results/sou104-S8-expired-${locale()}.png` });
});

// ── S9 · Wrong-machine / wrong-center genuine license → hard-lock mismatch ────
test('S9 — wrong-machine / wrong-center genuine license → hard-locked mismatch state', async () => {
  const L = LIC[locale()];

  const machineDir = freshUserDataDir();
  await seedConfiguredCenter(machineDir, locale());
  live = await launch(machineDir, locale(), { license: SIGNED.wrongMachine() });
  let status = await licenseStatus(live.win);
  expect(status.status).toBe('wrong-machine');
  expect(status.restricted).toBe(true);
  await assertHardLocked(live.win, L);
  await expect(live.win.getByText(L.statusWrongMachine, { exact: true })).toBeVisible();
  await live.app.close();

  const centerDir = freshUserDataDir();
  await seedConfiguredCenter(centerDir, locale());
  live = await launch(centerDir, locale(), { license: SIGNED.wrongCenter() });
  status = await licenseStatus(live.win);
  expect(status.status).toBe('wrong-center');
  expect(status.restricted).toBe(true);
  await assertHardLocked(live.win, L);
  await expect(live.win.getByText(L.statusWrongCenter, { exact: true })).toBeVisible();
});

// ── S10 · Expired founder-discount metadata → banner, plan unchanged ──────────
test('S10 — expired founder-discount metadata → banner, plan unchanged', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: SIGNED.founderExpired() });
  const win = live.win;

  // The lapsed founder discount is informational — the license stays active.
  const status = await licenseStatus(win);
  expect(status.status).toBe('active');
  expect(status.restricted).toBe(false);
  expect(status.plan).toBe('premium');
  expect(status.founderDiscountExpired).toBe(true);

  await gotoLicenseSettings(win, locale());
  await expect(win.getByText(L.founderExpiredTitle, { exact: true })).toBeVisible();
  await expect(win.getByText('PREMIUM', { exact: true })).toBeVisible(); // plan unchanged
  await win.screenshot({ path: `test-results/sou104-S10-founder-expired-${locale()}.png` });
});

// ── S11 · Re-activation upgrade Essentiel → Pro → Premium from Settings ───────
test('S11 — re-activation upgrade Essentiel → Pro → Premium from Settings', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: SIGNED.valid({ plan: 'essentiel', centersAllowed: 1 }) });
  const win = live.win;
  expect((await licenseStatus(win)).plan).toBe('essentiel');

  await gotoLicenseSettings(win, locale());

  await activateViaForm(win, locale(), SIGNED.valid({ plan: 'pro', centersAllowed: 1 }));
  await expect(win.getByText(L.successTitle, { exact: true })).toBeVisible();
  await expect.poll(async () => (await licenseStatus(win)).plan).toBe('pro');

  await activateViaForm(win, locale(), SIGNED.valid({ plan: 'premium', centersAllowed: 3 }));
  await expect(win.getByText(L.successTitle, { exact: true })).toBeVisible();
  await expect.poll(async () => (await licenseStatus(win)).plan).toBe('premium');
  expect((await licenseStatus(win)).centersAllowed).toBe(3);

  await win.screenshot({ path: `test-results/sou104-S11-upgrade-${locale()}.png` });
});

// ── S12 · Settings › Licence entry point (reachable only once active) ─────────
test('S12 — Settings › Licence entry point (only reachable once a valid license is active)', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  await seedConfiguredCenter(dir, locale());

  live = await launch(dir, locale(), { license: SIGNED.valid() });
  const win = live.win;
  expect((await licenseStatus(win)).status).toBe('active');

  // Reaching Settings › Licence at all proves the entry point is live once active;
  // the restricted case has no navigation (asserted by S1/S4's hard lock).
  await gotoLicenseSettings(win, locale());
  await expect(win.getByText(L.settingsLicenseTitle, { exact: true }).first()).toBeVisible();
  await expect(win.getByLabel(L.formLabel)).toBeVisible();
  await expect(win.getByText(L.statusActive, { exact: true })).toBeVisible();
});

// ── S13 · Per-center VALID activation isolation (A active → B still restricted)
test('S13 — per-center VALID activation isolation: activating A leaves B restricted', async () => {
  const L = LIC[locale()];
  const dir = freshUserDataDir();
  const A = 'CS-AAA-001';
  const B = 'CS-BBB-002';

  await seedConfiguredCenter(dir, locale(), A);
  live = await launch(dir, locale(), { center: A, license: SIGNED.valid({ centerCode: A }) });
  expect((await licenseStatus(live.win)).status).toBe('active');
  await live.app.close();

  // Same laptop dir, switch to center B — its own license file was never written,
  // so B resolves to `missing` and stays hard-locked, unaffected by A's activation.
  live = await launch(dir, locale(), { center: B });
  const bStatus = await licenseStatus(live.win);
  expect(bStatus.status).toBe('missing');
  expect(bStatus.restricted).toBe(true);
  await assertHardLocked(live.win, L);
});

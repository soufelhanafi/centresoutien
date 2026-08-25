import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import * as cpf from './center-profile.fixtures';
import * as se from './schedule-export.fixtures';
import * as inv from './invoices.fixtures';

// SOU-250 — black-box coverage for the gaps the shipped E2E suite leaves open:
// wizard-entry logo upload, save-gating while an upload is in flight, the
// dedicated upload-failure toast, and the invoice-detail logo. Verdicts come
// only from the running UI + the public bridge (`window.api.invoke`).

type Locale = 'fr' | 'ar';

const locale = () => test.info().project.name as Locale;

const TOAST = {
  fr: "L'envoi du logo a échoué. Réessayez.",
  ar: 'فشل رفع الشعار. حاول مرة أخرى.',
} as const;

let live: cpf.Launched | null = null;
const tempDirs: string[] = [];
let bigLogoPath: string | null = null;

test.afterEach(async () => {
  await live?.app.close();
  live = null;
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
  bigLogoPath = null;
});

// A valid 1×1 PNG padded to ~2 MiB so the upload round-trip is observable.
// Built once per test (not per retry) and the temp dir is removed in afterEach.
function makeBigLogoFile(): string {
  if (bigLogoPath) return bigLogoPath;
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f0005000101a5f645b70000000049454e44ae426082',
    'hex',
  );
  const padded = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 - 1 - png.length)]);
  const dir = mkdtempSync(join(tmpdir(), 'cs-qa-biglogo-'));
  tempDirs.push(dir);
  const p = join(dir, 'logo.png');
  writeFileSync(p, padded);
  bigLogoPath = p;
  return p;
}

// AC5 / race fix — the Settings Save button must stay disabled while the logo
// upload is in flight, so a click can never flush the stale (null) logoPath.
// The upload window is a few ms, so the disabled check is retried across fresh
// picks; the unit renderer test covers the gating deterministically.
test('SOU-250 race — Settings Save is gated while a large logo upload is in flight', async () => {
  const loc = locale();
  const t = cpf.CP[loc];
  const dir = cpf.freshUserDataDir();
  live = await cpf.launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;
  await cpf.completeSetupAndLogin(win, loc);

  const f = cpf.centerForm(win, loc);
  await f.name().fill('Centre QA Race');

  let sawDisabled = false;
  for (let attempt = 0; attempt < 6 && !sawDisabled; attempt++) {
    await f.logo().setInputFiles(makeBigLogoFile());
    try {
      await expect(f.submit(), 'Save must be disabled while the upload is in flight').toBeDisabled({ timeout: 400 });
      sawDisabled = true;
    } catch {
      // Upload landed before the first poll; retry with a fresh pick.
    }
  }
  expect(sawDisabled, 'gating observed at least once (deterministic proof lives in the renderer unit test)').toBe(true);

  await expect(f.submit()).toBeEnabled();
  await f.submit().click();
  await expect(win.getByText(t.saveSuccess).first()).toBeVisible();

  const stored = await cpf.getCenter(win);
  expect(stored?.logoPath).toBeTruthy();
  expect(stored?.logoPath ?? '').not.toMatch(/^([A-Za-z]:[\\/]|\/)/);
});

// AC5 / failure path — when the upload fails, the dedicated toast (not the
// generic save error) shows and nothing is persisted.
test.skip(process.platform === 'win32', 'chmod-based fault injection is POSIX-only');
test('SOU-250 failure — upload failure shows the dedicated toast and persists nothing new', async () => {
  const loc = locale();
  const t = cpf.CP[loc];
  const dir = cpf.freshUserDataDir();
  live = await cpf.launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;
  await cpf.completeSetupAndLogin(win, loc);

  const f = cpf.centerForm(win, loc);
  // Save a profile with a logo first (creates <dir>/logos), giving a persisted baseline.
  await f.logo().setInputFiles(cpf.makeLogoFile());
  await f.submit().click();
  await expect(win.getByText(t.saveSuccess).first()).toBeVisible();
  const before = await cpf.getCenter(win);
  expect(before?.logoPath).toBeTruthy();

  // Make the logo dir read-only so the next write fails server-side.
  chmodSync(join(dir, 'logos'), 0o555);
  try {
    await f.logo().setInputFiles(cpf.makeLogoFile());
    await expect(win.getByText(TOAST[loc]).first()).toBeVisible();
  } finally {
    chmodSync(join(dir, 'logos'), 0o755);
  }

  // The saved path is untouched: the failed upload never lifted a new path.
  const after = await cpf.getCenter(win);
  expect(after?.logoPath).toBe(before?.logoPath);
});

// AC1 (wizard entry point) — a logo picked in the first-run wizard persists.
test('SOU-250 wizard — logo picked in the first-run wizard persists a logoPath', async () => {
  const loc = locale();
  const t = cpf.CP[loc];
  const dir = cpf.freshUserDataDir();
  live = await cpf.launch({ locale: loc, plan: 'pro', userDataDir: dir });
  const win = live.win;

  await win.getByRole('button', { name: t.createModeCard }).click();
  await win.getByRole('radio', { name: t.langRadio }).check();
  await win.getByRole('button', { name: t.next }).click();
  await expect(win.getByText(t.wizardCenterTitle).first()).toBeVisible();

  await win.getByLabel(t.nameLabel, { exact: true }).fill('Centre Wizard QA');
  await win.getByLabel(t.phoneLabel, { exact: true }).fill('+212612345678');
  await win.getByLabel(t.logoLabel, { exact: true }).setInputFiles(cpf.makeLogoFile());
  await win.getByRole('button', { name: t.next }).click();

  await win.getByLabel(t.username, { exact: true }).fill(cpf.VALID_ADMIN.username);
  await win.getByLabel(t.password, { exact: true }).fill(cpf.VALID_ADMIN.password);
  await win.getByLabel(t.confirmPassword, { exact: true }).fill(cpf.VALID_ADMIN.password);
  await win.getByRole('button', { name: t.next }).click();
  await win.getByRole('button', { name: t.doneCta }).click();

  await win.evaluate(async (admin) => {
    // The E2E window types the bridge as `window.api`, but `window` here is the
    // Electron main-world global; the narrow cast gives the fixture a typed
    // invoke without importing the preload contract into a black-box spec.
    const api = (window as unknown as {
      api: { invoke: (c: string, r: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, cpf.VALID_ADMIN);
  await win.reload();

  await expect.poll(async () => (await cpf.getCenter(win))?.logoPath, { timeout: 5000 }).toBeTruthy();
});

// AC3 — the persisted logo renders in the invoice detail header.
test('SOU-250 invoice — logo renders in the invoice detail header', async () => {
  const loc = locale();
  const L = inv.STR[loc];
  live = await inv.boot(loc);
  const win = live.win;

  await se.saveCenterProfile(win, loc, { name: 'Centre QA Facture', phone: '+212612345678', logoFile: cpf.makeLogoFile() });
  expect((await se.getCenter(win))?.logoPath).toBeTruthy();

  const seeded = await inv.seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: '2026-08', priceMad: 200 });
  await inv.gotoInvoices(win, L);
  const rowName = loc === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  const row = win.getByRole('row', { name: inv.escapeRegExp(rowName) });
  await row.getByRole('link', { name: inv.escapeRegExp(seeded.studentNameFr) }).click();

  // Deterministic wait for the detail page: its header renders the invoice
  // number as "N° <id>". The logo <img> (decorative, so aria-hidden — a CSS
  // locator is the only stable handle) appears once center.get + center.logoBytes resolve.
  await expect(win.getByText(inv.escapeRegExp(seeded.invoiceId)).first()).toBeVisible();
  const logo = win.locator('img[aria-hidden="true"]').first();
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute('src')).toMatch(/^blob:/);
  // Decode, not just presence: a CSP-blocked blob still renders a broken <img>
  // that `toBeVisible` would accept (SOU-28 logo regression).
  await expect
    .poll(async () => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(0);
});

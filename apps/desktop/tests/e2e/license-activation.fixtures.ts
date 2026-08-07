import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createPrivateKey, generateKeyPairSync, sign as signBytes, type KeyObject } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SOU-104 / SOU-172 — License activation, restricted-mode HARD LOCK, per-center
 * isolation.
 *
 * Black-box: driven only through the running UI and the public preload bridge
 * (`window.api.invoke`). No renderer / domain / data implementation is imported.
 *
 * TRUST-ANCHOR INJECTION (SOU-172): the specs run against the dedicated E2E build
 * (`electron-vite build --mode e2e`, wired via `pretest:e2e`), the only build
 * where the compile-time flag `__CS_E2E__` is `true`. That unlocks the license
 * trust-anchor seam in the main process, so `launch()` injects the committed
 * TEST public key through `CS_LICENSE_PUBLIC_KEY`. The app then trusts envelopes
 * signed with the committed TEST private key — making every signature-VALID
 * acceptance state (active / expired / wrong-machine / wrong-center /
 * founder-expired / re-activation upgrade / per-center isolation) reachable
 * black-box. A release build sets `__CS_E2E__` false, dead-code-eliminating the
 * seam, so this key is never trusted in production.
 *
 * Two signers are used deliberately:
 *   - `signTest(...)` — the committed TEST private key → signature-VALID on the
 *     e2e build (S7–S13).
 *   - `signForged(...)` — a throwaway, per-run key the app never trusts → always
 *     `invalid-signature` (the tampered/forged fixtures for S2 / S4 / S6).
 */

export type Locale = 'fr' | 'ar';
const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

/** The committed test-only keypair (see tests/fixtures/license/README.md). */
const FIXTURE_DIR = join(dirname, '../fixtures/license');
export const TEST_PUBLIC_KEY_PEM = readFileSync(join(FIXTURE_DIR, 'test-public-key.pem'), 'utf8');
const testPrivateKey = createPrivateKey(readFileSync(join(FIXTURE_DIR, 'test-private-key.pem'), 'utf8'));

export const ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') };
export const DEFAULT_CENTER = 'CS-DEV-001';
export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

function signWith(key: KeyObject, claims: Record<string, unknown>): string {
  const claimsB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = signBytes(null, Buffer.from(claimsB64, 'utf8'), key).toString('base64');
  return JSON.stringify({ claims: claimsB64, signature });
}

const forgedKeypair = generateKeyPairSync('ed25519');
/** Signed with a key the app never trusts → always `invalid-signature`. */
function signForged(claims: Record<string, unknown>): string {
  return signWith(forgedKeypair.privateKey, claims);
}
/** Signed with the committed TEST key → signature-VALID on the e2e build. */
function signTest(claims: Record<string, unknown>): string {
  return signWith(testPrivateKey, claims);
}

type ClaimOverrides = Partial<{
  plan: 'essentiel' | 'pro' | 'premium';
  expiresAt: string;
  machineId: string | null;
  centerCode: string | null;
  centersAllowed: number | null;
  founderDiscountExpiresAt: string | null;
}>;

const BASE = {
  plan: 'premium' as const,
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2999-01-01T00:00:00.000Z',
  machineId: null as string | null,
  centerCode: null as string | null,
  centersAllowed: 3 as number | null,
  founderDiscountExpiresAt: null as string | null,
};

/** Correctly-SHAPED, throwaway-signed envelopes — all resolve to
 *  `invalid-signature` (the tampered / forged fixtures for S2 / S4 / S6). */
export const ENVELOPES = {
  valid: () => signForged(BASE),
  expired: () => signForged({ ...BASE, expiresAt: '2000-01-01T00:00:00.000Z' }),
  wrongMachine: () => signForged({ ...BASE, machineId: 'some-other-machine-id' }),
  wrongCenter: () => signForged({ ...BASE, centerCode: 'CS-OTHER-999' }),
  founderExpired: () => signForged({ ...BASE, founderDiscountExpiresAt: '2000-01-01T00:00:00.000Z' }),
};

/** Signature-VALID envelopes (committed TEST key) for the acceptance states
 *  reachable on the e2e build (SOU-172, S7–S13). */
export const SIGNED = {
  valid: (overrides: ClaimOverrides = {}) => signTest({ ...BASE, ...overrides }),
  expired: () => signTest({ ...BASE, expiresAt: '2000-01-01T00:00:00.000Z' }),
  wrongMachine: () => signTest({ ...BASE, machineId: 'some-other-machine-id' }),
  wrongCenter: () => signTest({ ...BASE, centerCode: 'CS-OTHER-999' }),
  founderExpired: () => signTest({ ...BASE, founderDiscountExpiresAt: '2000-01-01T00:00:00.000Z' }),
};

export const GARBAGE_KEY = 'this-is-not-a-license-key-at-all';

/** User-facing copy asserted on, mirrored from renderer i18n `license.*`,
 *  `settings.*`, `shell.*`, and the PlanBadge (upper-cased tier, untranslated). */
export const LIC: Record<Locale, Record<string, string>> = {
  fr: {
    title: 'Activation de la licence',
    restrictedTitle: 'Mode restreint',
    import: 'Importer un fichier',
    activate: 'Activer',
    skip: 'Continuer en mode restreint',
    statusActive: 'Licence active',
    statusInvalid: 'Signature invalide',
    statusMissing: 'Aucune licence',
    statusExpired: 'Licence expirée',
    statusWrongMachine: 'Licence liée à un autre appareil',
    statusWrongCenter: 'Licence liée à un autre centre',
    reasonInvalid: 'Signature invalide : cette licence a été modifiée ou est falsifiée.',
    founderExpiredTitle: 'Réduction fondateur expirée',
    centersAllowedLabel: 'Centres autorisés',
    successTitle: 'Licence activée',
    formLabel: 'Clé ou contenu du fichier de licence',
    settingsNav: 'Paramètres',
    settingsTab: 'Licence',
    settingsLicenseTitle: 'Licence',
    logout: 'Se déconnecter',
    dashboard: 'Tableau de bord',
    appMarker: 'Centre principal',
    wizardTitle: 'Configuration initiale',
  },
  ar: {
    title: 'تفعيل الترخيص',
    restrictedTitle: 'الوضع المقيّد',
    import: 'استيراد ملف',
    activate: 'تفعيل',
    skip: 'المتابعة في الوضع المقيّد',
    statusActive: 'ترخيص مُفعّل',
    statusInvalid: 'توقيع غير صالح',
    statusMissing: 'لا يوجد ترخيص',
    statusExpired: 'ترخيص منتهي الصلاحية',
    statusWrongMachine: 'الترخيص مرتبط بجهاز آخر',
    statusWrongCenter: 'الترخيص مرتبط بمركز آخر',
    reasonInvalid: 'توقيع غير صالح: تم تعديل هذا الترخيص أو التلاعب به.',
    founderExpiredTitle: 'انتهت صلاحية خصم المؤسِّس',
    centersAllowedLabel: 'المراكز المسموح بها',
    successTitle: 'تم تفعيل الترخيص',
    formLabel: 'المفتاح أو محتوى ملف الترخيص',
    settingsNav: 'الإعدادات',
    settingsTab: 'الترخيص',
    settingsLicenseTitle: 'الترخيص',
    logout: 'تسجيل الخروج',
    dashboard: 'لوحة التحكم',
    appMarker: 'المركز الرئيسي',
    wizardTitle: 'الإعداد الأولي',
  },
};

export type Launched = { app: ElectronApplication; win: Page };

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-license-e2e-'));
}

export function writeCenterLicense(dir: string, center: string, envelope: string): void {
  writeFileSync(join(dir, `license.${center}.json`), envelope);
}

export async function launch(
  dir: string,
  locale: Locale,
  opts: { center?: string; license?: string } = {},
): Promise<Launched> {
  const center = opts.center ?? DEFAULT_CENTER;
  if (opts.license !== undefined) writeCenterLicense(dir, center, opts.license);
  // The e2e build's `__CS_E2E__`-gated seam reads CS_LICENSE_PUBLIC_KEY: inject the
  // committed TEST key so envelopes signed with `signTest` verify (SOU-172). Strip
  // the global-setup unlock flag so THIS suite exercises the real file-based hard
  // lock (missing/invalid/expired/wrong-* → restricted) instead of the synthetic
  // always-active license the feature suite uses.
  const env = { ...process.env, CS_LOCALE: locale, CS_CENTER_CODE: center, CS_LICENSE_PUBLIC_KEY: TEST_PUBLIC_KEY_PEM };
  delete env['CS_E2E_LICENSE_PLAN'];
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

export async function invoke<T = unknown>(win: Page, channel: string, req: unknown): Promise<T> {
  return win.evaluate(
    async ({ c, r }) => {
      const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<T> } }).api;
      return api.invoke(c, r);
    },
    { c: channel, r: req },
  ) as Promise<T>;
}

/**
 * Create the admin (as the SOU-25 wizard would) + a remembered session, so a
 * later relaunch lands past the AuthGate — where the SOU-104 hard-lock gate is.
 *
 * `auth.login` is one of the channels the SOU-104 server-side hard lock blocks
 * once setup is complete, so the session can only be minted while a license is
 * ACTIVE. We seed with a signature-valid license (SOU-172), log in, then delete
 * the per-center license file: the remembered session persists in the shared DB
 * while the license resolves back to `missing`, so each spec starts from a
 * configured-but-unlicensed center and installs whichever license state it needs.
 */
export async function seedConfiguredCenter(dir: string, locale: Locale, center = DEFAULT_CENTER): Promise<void> {
  const { app, win } = await launch(dir, locale, { center, license: SIGNED.valid({ centerCode: center }) });
  await invoke(win, 'admin.create', ADMIN);
  await invoke(win, 'auth.login', { ...ADMIN, rememberDevice: true });
  await app.close();
  rmSync(join(dir, `license.${center}.json`), { force: true });
}

/** Open Settings and switch to the Licence tab (only reachable once active). */
export async function gotoLicenseSettings(win: Page, locale: Locale): Promise<void> {
  const L = LIC[locale];
  await win.getByRole('link', { name: L.settingsNav }).click();
  await win.getByRole('tab', { name: L.settingsTab }).click();
  await win.getByText(L.settingsLicenseTitle, { exact: true }).first().waitFor({ state: 'visible' });
}

/** Paste a raw envelope into the visible activation form and submit it. */
export async function activateViaForm(win: Page, locale: Locale, rawLicense: string): Promise<void> {
  const L = LIC[locale];
  await win.getByLabel(L.formLabel).fill(rawLicense);
  await win.getByRole('button', { name: L.activate }).click();
}

export type LicenseStatus = {
  status: 'active' | 'missing' | 'invalid-signature' | 'expired' | 'wrong-machine' | 'wrong-center';
  plan: 'essentiel' | 'pro' | 'premium';
  restricted: boolean;
  expiresAt: string | null;
  centersAllowed: number | null;
  founderDiscountExpiresAt: string | null;
  founderDiscountExpired: boolean;
};

export const licenseStatus = (win: Page) => invoke<LicenseStatus>(win, 'license.status', {});

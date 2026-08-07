import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SOU-104 — License activation, restricted-mode HARD LOCK, per-center isolation.
 *
 * Black-box: driven only through the running UI and the public preload bridge
 * (`window.api.invoke`). No renderer / domain / data implementation is imported.
 *
 * INJECTION REALITY (empirically re-verified against the CURRENT packaged
 * `out/main` build, post hard-lock + real-IPC merge):
 *   - The app embeds a FIXED vendor Ed25519 public key and reads the license from
 *     the PER-CENTER file `<userDataDir>/license.<centerCode>.json`. The DEV-only
 *     `CS_LICENSE_PUBLIC_KEY` / `CS_LICENSE_FILE` overrides are tree-shaken out of
 *     the production build (`import.meta.env.DEV === false`), confirmed by grep of
 *     out/main and by a runtime probe (a test-signed envelope still resolves to
 *     `invalid-signature`). So the trust anchor cannot be swapped in E2E.
 *   - The embedded key is a placeholder with NO committed private key, so no test
 *     can forge a SIGNATURE-VALID license. Every envelope built here is authentic
 *     in SHAPE but throwaway-signed → the app resolves them to `invalid-signature`
 *     (i.e. they are the "tampered / forged" fixtures). The signature-VALID states
 *     (active / expired / wrong-machine / wrong-center / founder-expired /
 *     re-activation upgrade / Settings entry / valid per-center isolation) are
 *     therefore NOT black-box reachable on the packaged app — those specs are
 *     `test.skip`ped with this reason and are covered by domain unit + integration
 *     tests (tests/integration/ed25519-license-adapter.test.ts injects a keypair).
 */

export type Locale = 'fr' | 'ar';
const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export const ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') };
export const DEFAULT_CENTER = 'CS-DEV-001';
export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

const throwawayKeypair = generateKeyPairSync('ed25519');
function signEnvelope(claims: Record<string, unknown>): string {
  const claimsB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64');
  const signature = signBytes(null, Buffer.from(claimsB64, 'utf8'), throwawayKeypair.privateKey).toString('base64');
  return JSON.stringify({ claims: claimsB64, signature });
}

const BASE = {
  plan: 'premium' as const,
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2999-01-01T00:00:00.000Z',
  machineId: null,
  centerCode: null,
  centersAllowed: 3,
  founderDiscountExpiresAt: null,
};

/** Correctly-SHAPED envelopes per acceptance state; all resolve to
 *  `invalid-signature` on the packaged app (throwaway key). */
export const ENVELOPES = {
  valid: () => signEnvelope(BASE),
  expired: () => signEnvelope({ ...BASE, expiresAt: '2000-01-01T00:00:00.000Z' }),
  wrongMachine: () => signEnvelope({ ...BASE, machineId: 'some-other-machine-id' }),
  wrongCenter: () => signEnvelope({ ...BASE, centerCode: 'CS-OTHER-999' }),
  founderExpired: () => signEnvelope({ ...BASE, founderDiscountExpiresAt: '2000-01-01T00:00:00.000Z' }),
};
export const GARBAGE_KEY = 'this-is-not-a-license-key-at-all';

/** User-facing copy asserted on, mirrored from renderer i18n `license.*`. */
export const LIC: Record<Locale, Record<string, string>> = {
  fr: {
    title: 'Activation de la licence',
    restrictedTitle: 'Mode restreint',
    import: 'Importer un fichier',
    activate: 'Activer',
    skip: 'Continuer en mode restreint',
    statusInvalid: 'Signature invalide',
    statusMissing: 'Aucune licence',
    reasonInvalid: 'Signature invalide : cette licence a été modifiée ou est falsifiée.',
    settingsTab: 'Licence',
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
    statusInvalid: 'توقيع غير صالح',
    statusMissing: 'لا يوجد ترخيص',
    reasonInvalid: 'توقيع غير صالح: تم تعديل هذا الترخيص أو التلاعب به.',
    settingsTab: 'الترخيص',
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
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${dir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_CENTER_CODE: center },
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

/** Create the admin (as the SOU-25 wizard would) + a remembered session, so a
 *  later relaunch lands past the AuthGate — where the SOU-104 hard-lock gate is. */
export async function seedConfiguredCenter(dir: string, locale: Locale, center = DEFAULT_CENTER): Promise<void> {
  const { app, win } = await launch(dir, locale, { center });
  await invoke(win, 'admin.create', ADMIN);
  await invoke(win, 'auth.login', { ...ADMIN, rememberDevice: true });
  await app.close();
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

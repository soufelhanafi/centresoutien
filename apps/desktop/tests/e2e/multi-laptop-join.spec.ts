import { test, expect } from '@playwright/test';
import {
  startHub,
  launchDevice,
  launchJoiner,
  saveCenterProfile,
  createSubject,
  listSubjectNamesFr,
  runSync,
  closeAll,
  VALID_ADMIN,
  HUB_TOKEN,
  CENTER_CODE,
  type Locale,
  type Device,
  type Hub,
} from './multi-laptop-sync.fixtures';

/**
 * SOU-318 — "Join an existing center on a second device" end-to-end. A host device
 * seeds a center + owner + a subject and pushes them to a bare standalone hub; a
 * FRESH second device then goes through the real first-run wizard's "join" branch
 * (manual address + pairing code — mDNS multicast is not reliable in CI), cold-
 * bootstraps a local replica from the hub feed, and must end up holding the host's
 * center, owner account, and data. Runs under both the `fr` and `ar` projects.
 */

const locale = () => test.info().project.name as Locale;

// Join-branch copy, mirrored from i18n {fr,ar}.json (wizard.mode / hub.join / auth).
const JOIN: Record<
  Locale,
  {
    joinCard: string;
    manualToggle: string;
    manualContinue: string;
    codeConfirm: string;
    authTitle: string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    joinCard: 'Rejoindre un centre existant',
    manualToggle: "Saisir l'adresse manuellement",
    manualContinue: 'Continuer',
    codeConfirm: 'Rejoindre',
    authTitle: 'Connexion',
    dir: 'ltr',
  },
  ar: {
    joinCard: 'الانضمام إلى مركز موجود',
    manualToggle: 'إدخال العنوان يدويًا',
    manualContinue: 'متابعة',
    codeConfirm: 'انضمام',
    authTitle: 'تسجيل الدخول',
    dir: 'rtl',
  },
};

let hub: Hub | null = null;
let host: Device | null = null;
let joiner: Device | null = null;

test.beforeEach(() => {
  // Standalone hub + two device apps + a cold-bootstrap pull — past the 30s default.
  test.setTimeout(120_000);
});

test.afterEach(async () => {
  await closeAll(joiner, host, hub);
  hub = host = joiner = null;
});

test('a second device joins an existing center over the LAN and cold-bootstraps its data', async () => {
  const loc = locale();
  const J = JOIN[loc];

  hub = await startHub();

  // Host: seed a center + owner (from launchDevice) + a subject, then push it all.
  host = await launchDevice(loc, hub.port, 'host');
  await saveCenterProfile(host.win, 'Centre Principal');
  await createSubject(host.win, 'Alpha', 'ألفا');
  const push = await runSync(host.win);
  expect(push?.pushed).toBeGreaterThanOrEqual(1);

  // Joiner: a clean first-run wizard drives the real join branch.
  joiner = await launchJoiner(loc, 'joiner');
  const win = joiner.win;
  if (loc === 'ar') await expect(win.locator('html')).toHaveAttribute('dir', 'rtl');

  // choose "join" → manual address (mDNS is not reliable in CI) → pairing code.
  await win.getByRole('button', { name: new RegExp(J.joinCard) }).click();
  await win.getByRole('button', { name: J.manualToggle }).click();
  await win.locator('#join-host').fill('127.0.0.1');
  await win.locator('#join-port').fill(String(hub.port));
  await win.locator('#join-center-code').fill(CENTER_CODE);
  await win.getByRole('button', { name: J.manualContinue }).click();
  await win.locator('#join-token').fill(HUB_TOKEN);
  await win.getByRole('button', { name: J.codeConfirm }).click();

  // On success main cold-bootstraps + switches into the joined center; the first-run
  // gate re-renders to its LOGIN screen (the synced admin now exists).
  await expect(win.getByRole('heading', { level: 1, name: J.authTitle })).toBeVisible({ timeout: 60_000 });

  // Prove the bootstrap reconstructed the center: log in as the SYNCED director
  // (whose account only exists here because it was pulled) and read the subject back.
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');

  expect(await listSubjectNamesFr(win)).toContain('Alpha');
});

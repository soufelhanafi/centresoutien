import { expect, test } from '@playwright/test';
import {
  D,
  bootRealCenter,
  demoStatus,
  forceClose,
  hubListening,
  waitForHub,
  type BootedReal,
  type Locale,
} from './demo-hot-swap.fixtures';
import { DEMO_ADMIN } from './demo-mode.fixtures';

/**
 * SOU-190 — when the demoing laptop is the active LAN hub host, `demo.create`
 * silently stops the embedded HubServer, cutting off teammates' sync. The
 * renderer must confirm the trade-off first (bilingual FR/AR warning dialog),
 * then proceed — the hub still stops, the warning only makes it explicit.
 *
 * Precondition: `demo.status` reports `isHubHost: true`, which only happens when
 * the app boots with the embedded hub configured (`CS_HUB_ENABLED` +
 * `CS_HUB_TOKEN` + `CS_HUB_PORT` + `CS_HUB_BIND_HOST`, see
 * `bootRealCenter({ hubHost: true })`). No warning fires on wipe (demo→real
 * restores the hub) and none fires when this laptop is not the hub host.
 *
 * Runs under both `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let real: BootedReal | null = null;
test.afterEach(async () => {
  await forceClose(real?.app ?? undefined);
  real = null;
});

// ---------------------------------------------------------------------------
// HW1 — hub host: clicking create opens the warning; cancel leaves the real
// center untouched (demo.create never fires).
// ---------------------------------------------------------------------------
test('HW1 — hub-host create shows the warning; cancel keeps the real center (no create)', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc, { hubHost: true });
  const { win } = real;

  // Given: on the "Mode démo" settings tab of the hub-host real center.
  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();

  // When: clicking create on a hub host.
  await panel.getByRole('button', { name: t.createBtn, exact: true }).click();

  // Then: the warning dialog explains the hub is this laptop, before any swap.
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByText(t.hubWarnTitle, { exact: true })).toBeVisible();
  await expect(dialog.getByText(t.hubWarnBody, { exact: true })).toBeVisible();
  expect(await demoStatus(win), 'no swap may happen before confirming').toBe(false);

  // Then: (AC4) the AR project renders the dialog RTL.
  if (loc === 'ar') {
    await expect(win.locator('html')).toHaveAttribute('dir', 'rtl');
  }

  // When: cancelling. The dialog's close (X) button shares its accessible name
  // with the footer cancel button, so target the first matching button — the
  // footer cancel renders before the close X in DOM order.
  await dialog.getByRole('button', { name: t.hubWarnCancel, exact: true }).first().click();

  // Then: the dialog closes and the real center stays untouched.
  await expect(dialog).not.toBeVisible();
  expect(await demoStatus(win), 'cancel must not swap into demo').toBe(false);
  await win.screenshot({ path: `test-results/hw1-cancelled-${loc}.png` });
});

// ---------------------------------------------------------------------------
// HW2 — hub host: confirming the warning proceeds with demo.create — the hub
// stops and the demo hot-swaps in place, but only after an explicit confirm.
// ---------------------------------------------------------------------------
test('HW2 — hub-host create warns; confirm proceeds and hot-swaps into demo', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc, { hubHost: true });
  const { win, hubPort } = real;

  // Given: the hub is actually serving before the demo swap (AC5 baseline).
  await expect(win.getByRole('link', { name: t.settingsNav, exact: true })).toBeVisible();
  expect(hubPort, 'hub host boot must expose a bound port').toBeDefined();
  expect(await hubListening(hubPort!), 'hub must be listening before demo.create').toBe(true);

  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();

  // When: clicking create on a hub host, then confirming the warning.
  await panel.getByRole('button', { name: t.createBtn, exact: true }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByText(t.hubWarnTitle, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: t.hubWarnConfirm, exact: true }).click();

  // Then: demo.create ran and the swap landed on the demo center — the demo DB
  // holds no remembered session, so the one-step demo login screen appears
  // (same landing the non-hub-host path takes in HS4).
  await expect(
    win.getByText(t.loginDemoPrefillTitle, { exact: false }),
    'confirm must proceed into the demo center',
  ).toBeVisible({ timeout: 90_000 });
  expect(await demoStatus(win), 'confirm must swap into demo').toBe(true);
  await win.screenshot({ path: `test-results/hw2-confirmed-${loc}.png` });

  // Then: (AC5) the hub is stopped for the demo duration — behavior unchanged
  // by the warning, only made explicit. A closed loopback port means no laptop
  // can sync while the demo is live.
  expect(
    await waitForHub(hubPort!, false, 15_000),
    'hub must stop while the demo center is live',
  ).toBe(true);
});

// ---------------------------------------------------------------------------
// HW3 — NOT a hub host (default): no warning, create proceeds directly into the
// swap. Nothing about the demoing laptop is special, so there is no trade-off
// to surface (AC2).
// ---------------------------------------------------------------------------
test('HW3 — non-hub host create proceeds with NO warning', async () => {
  test.setTimeout(120_000);
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc);
  const { win } = real;

  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();

  // When: clicking create on a laptop that is not the hub host.
  await panel.getByRole('button', { name: t.createBtn, exact: true }).click();

  // Then: the swap proceeds directly — no warning dialog ever appears, and the
  // app lands on the demo login as HS4 describes.
  await expect(
    win.getByText(t.loginDemoPrefillTitle, { exact: false }),
    'create must proceed straight into the demo center without a warning',
  ).toBeVisible({ timeout: 90_000 });
  expect(await demoStatus(win)).toBe(true);
  expect(
    await win.getByText(t.hubWarnTitle, { exact: true }).count(),
    'the hub-host warning must not appear when this laptop is not the hub host',
  ).toBe(0);
  await win.screenshot({ path: `test-results/hw3-no-warning-${loc}.png` });
});

// ---------------------------------------------------------------------------
// HW4 — wipe (demo→real) on a hub host: no warning (there is nothing to warn
// about — wiping RESTORES the hub), wipe proceeds, and the hub is serving again
// (AC3 + AC5 restore side).
// ---------------------------------------------------------------------------
test('HW4 — wipe shows NO warning and restores the hub', async () => {
  test.setTimeout(180_000);
  const loc = locale();
  const t = D[loc];
  real = await bootRealCenter(loc, { hubHost: true });
  const { win, hubPort } = real;
  expect(hubPort).toBeDefined();

  // Given: in demo on the hub host — create with the confirm warning, sign in.
  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const panel = win.getByRole('tabpanel');
  await expect(panel.getByRole('button', { name: t.createBtn, exact: true })).toBeVisible();
  await panel.getByRole('button', { name: t.createBtn, exact: true }).click();
  const warn = win.getByRole('dialog');
  await expect(warn.getByText(t.hubWarnTitle, { exact: true })).toBeVisible();
  await warn.getByRole('button', { name: t.hubWarnConfirm, exact: true }).click();
  await expect(
    win.getByText(t.loginDemoPrefillTitle, { exact: false }),
  ).toBeVisible({ timeout: 90_000 });
  // SOU-186 prefills the demo creds for a one-click sign-in. That prefill is
  // intermittently missed (pre-existing demo-mode race — see QA report); fill
  // the deterministic e2e demo creds whenever either field is empty so the wipe
  // flow under test is never blocked by it.
  const user = win.getByRole('textbox', { name: t.usernameLabel });
  const password = win.getByLabel(loc === 'fr' ? 'Mot de passe' : 'كلمة المرور', { exact: true });
  if ((await user.inputValue()) !== DEMO_ADMIN.username) await user.fill(DEMO_ADMIN.username);
  if ((await password.inputValue()) !== DEMO_ADMIN.password) await password.fill(DEMO_ADMIN.password);
  await win.getByRole('button', { name: t.loginSubmit, exact: true }).click();
  const banner = win.getByRole('banner').filter({ hasText: t.bannerLabel });
  await expect(banner, 'signed into the demo center').toBeVisible({ timeout: 60_000 });
  expect(await demoStatus(win)).toBe(true);

  // When: wiping from the demo center's "Mode démo" tab.
  await win.getByRole('link', { name: t.settingsNav, exact: true }).click();
  await win.getByRole('tab', { name: t.demoTab, exact: true }).click();
  const activePanel = win.getByRole('tabpanel');
  await expect(activePanel.getByRole('button', { name: t.activeWipe, exact: true })).toBeVisible();
  await activePanel.getByRole('button', { name: t.activeWipe, exact: true }).click();

  // Then: the plain wipe confirmation appears — and the hub-host warning does NOT
  // (wiping restores the hub, nothing to warn about).
  const wipeDialog = win.getByRole('dialog');
  await expect(wipeDialog.getByText(t.wipeDialogTitle, { exact: true })).toBeVisible();
  expect(
    await wipeDialog.getByText(t.hubWarnTitle, { exact: true }).count(),
    'wipe must not show the hub-host warning',
  ).toBe(0);
  await win.screenshot({ path: `test-results/hw4-wipe-dialog-${loc}.png` });

  // When: confirming the wipe.
  await wipeDialog.getByRole('button', { name: t.wipeDialogConfirm, exact: true }).click();

  // Then: back on the real center, hub serving again (AC3 restore side).
  await expect(
    win.getByRole('link', { name: t.settingsNav, exact: true }),
    'wipe lands back on the real center shell',
  ).toBeVisible({ timeout: 90_000 });
  expect(await demoStatus(win)).toBe(false);
  expect(
    await waitForHub(hubPort!, true, 30_000),
    'hub must be restored after wiping back to the real center',
  ).toBe(true);
  await win.screenshot({ path: `test-results/hw4-wiped-${loc}.png` });
});

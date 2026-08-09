import { expect, test } from '@playwright/test';
import {
  D,
  bootRealCenter,
  demoStatus,
  forceClose,
  type BootedReal,
  type Locale,
} from './demo-hot-swap.fixtures';

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

  // When: cancelling.
  await dialog.getByRole('button', { name: t.hubWarnCancel, exact: true }).click();

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
  const { win } = real;

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
});

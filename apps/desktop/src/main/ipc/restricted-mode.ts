import type { IpcChannel } from '../../shared/ipc/contract';

/**
 * The IPC channels reachable while the license is non-active (restricted mode,
 * SOU-104). The restricted *decision* is the domain's (`isRestrictedMode`); this
 * allow-list is its transport projection. Every other channel is hard-locked at
 * the dispatcher before its handler runs, so a renderer (or anything speaking to
 * the preload bridge) can never invoke e.g. `student.list` before a license is
 * activated. Enforcing it here supersedes the deferred SOU-173.
 *
 * The set is split by first-run state, because the two reasons a channel is open
 * under restriction expire at different times:
 *
 *  - {@link RESTRICTED_MODE_ALWAYS_ALLOWED}: the activation surface itself
 *    (`license.status` / `license.activate`) plus the one read every launch needs
 *    to route wizard-vs-app (`admin.exists`, consulted by `FirstRunGate`). These
 *    stay open in *both* setup states — blocking them would brick either the
 *    activation screen or first-run detection.
 *
 *  - {@link RESTRICTED_MODE_BOOTSTRAP_CHANNELS}: the mutations + prefill read the
 *    first-run wizard needs *before an admin account exists* — creating the admin
 *    (`admin.create`) and the center profile incl. its optional logo
 *    (`center.get` / `center.save` / `center.saveLogo` / `center.logoBytes`). A
 *    per-center license binds to a `centerCode` that does not exist until the
 *    wizard creates it, so on a fresh install the license is necessarily
 *    non-active and the wizard (FirstRunGate → LicenseGate) runs *before*
 *    activation is even possible; blocking these would deadlock setup. But once
 *    setup is complete (an admin account exists — the wizard's last durable
 *    artifact; progress is otherwise ephemeral), the wizard never runs again, so a
 *    later license lapse must NOT leave them reachable: an unlicensed, already
 *    configured center could otherwise still rewrite its profile or mint an admin.
 *    They are therefore gated on `!setupComplete`.
 *
 * Every business/feature channel (students, invoices, payments, teachers, groups,
 * sync, …) stays blocked in both states — the exploit CodeRabbit flagged
 * (`student.list` reachable while unlicensed) remains closed. The FR/AR language
 * toggle needs nothing here: it is client-only (`i18n.changeLanguage`).
 */
export const RESTRICTED_MODE_ALWAYS_ALLOWED: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'license.status',
  'license.activate',
  'admin.exists',
]);

export const RESTRICTED_MODE_BOOTSTRAP_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'admin.create',
  'center.get',
  'center.save',
  'center.saveLogo',
  'center.logoBytes',
]);

/**
 * Whether `channel` may run while the license is non-active. `setupComplete` is
 * the trusted main-process first-run state (an admin account exists): once true,
 * only the activation surface and first-run read remain open; the wizard's
 * bootstrap mutations close.
 */
export function isRestrictedModeChannelAllowed(
  channel: IpcChannel,
  setupComplete: boolean,
): boolean {
  if (RESTRICTED_MODE_ALWAYS_ALLOWED.has(channel)) return true;
  return !setupComplete && RESTRICTED_MODE_BOOTSTRAP_CHANNELS.has(channel);
}

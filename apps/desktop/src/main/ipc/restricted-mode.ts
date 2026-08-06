import type { IpcChannel } from '../../shared/ipc/contract';

/**
 * The only IPC channels reachable while the license is non-active (restricted
 * mode, SOU-104). The restricted *decision* is the domain's (`isRestrictedMode`);
 * this allow-list is its transport projection. Every other channel is hard-locked
 * at the dispatcher before its handler runs, so a renderer (or anything speaking to
 * the preload bridge) can never invoke e.g. `student.list` before a license is
 * activated. Enforcing it here supersedes the deferred SOU-173.
 *
 * Two groups are allowed, and only these two:
 *  - Activation: `license.status` / `license.activate` — the activation screen.
 *  - First-run bootstrap: a per-center license binds to a `centerCode` that does
 *    not exist until the first-run wizard creates it, so on a fresh install the
 *    license is necessarily non-active and the wizard (FirstRunGate → LicenseGate)
 *    runs *before* activation is even possible. Blocking it would deadlock setup —
 *    the user could never create the center they need to license. So the exact
 *    channels the wizard invokes pre-activation are permitted: the admin account
 *    (`admin.exists` / `admin.create`) and the center profile incl. its optional
 *    logo (`center.get` / `center.save` / `center.saveLogo` / `center.logoBytes`).
 *
 * Every business/feature channel (students, invoices, payments, teachers, groups,
 * sync, …) stays blocked — the exploit CodeRabbit flagged (`student.list` reachable
 * while unlicensed) remains closed. The FR/AR language toggle needs nothing here:
 * it is client-only (`i18n.changeLanguage`).
 */
export const RESTRICTED_MODE_ALLOWED_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'license.status',
  'license.activate',
  'admin.exists',
  'admin.create',
  'center.get',
  'center.save',
  'center.saveLogo',
  'center.logoBytes',
]);

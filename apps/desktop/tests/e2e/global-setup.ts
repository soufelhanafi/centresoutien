/**
 * Playwright global setup (SOU-172). The SOU-104 hard lock confines a non-active
 * license to the activation screen, so the whole feature suite — which seeds an
 * admin and logs in through `auth.login` — would be blocked before it starts.
 *
 * This flags the dedicated `--mode e2e` build to boot ACTIVE on the tier each
 * spec selects via `CS_PLAN` (see `E2eSyntheticLicense`), reproducing the
 * pre-lock world every feature spec relies on. It is inherited by the Playwright
 * worker (and thus by every `electron.launch({ env: { ...process.env } })`)
 * because it is set here, before any worker is forked.
 *
 * `license-activation.spec` deliberately strips this variable per launch, so it
 * still drives the real file-based lock through the Ed25519 adapter.
 */
export default function globalSetup(): void {
  process.env['CS_E2E_LICENSE_PLAN'] = 'premium';
}

/**
 * Performs a live, in-process switch to another center's database (SOU-96):
 * the adapter drains in-flight work, disposes the current center's container,
 * opens the target center DB, and re-wires every IPC handler to it. Only the
 * center is the tenant (CLAUDE.md §5ter), so a switch is a full close-one /
 * open-another file swap — never a cross-center merge.
 *
 * `centreId` is the per-center DB-file discriminator (e.g. `'local'`), NOT the
 * tenant `CenterCode`. The concrete adapter lives in the Electron main process
 * (it needs Electron + fs + SQLCipher); the domain declares only this seam so
 * {@link SwitchCenter} can gate the Premium `org.multi-center` feature and
 * delegate without knowing how the swap is performed.
 *
 * Contract: on any failure — the target cannot be opened, or a switch is already
 * in progress — implementations MUST throw `CenterSwitchError`. They must never
 * leave the app without an open center: build the new container before disposing
 * the old one, so a failed open leaves the current center untouched.
 */
export interface CenterSwitchPort {
  switchTo(centreId: string): Promise<void>;
}

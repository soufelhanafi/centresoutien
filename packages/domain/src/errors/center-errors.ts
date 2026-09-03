import { DomainError } from './plan-errors';

/**
 * A live center hot-swap (SOU-96) could not complete: the target center DB is
 * missing / unopenable, or another switch is already running (or work is still
 * in flight against the current center). Carries a stable `center-switch-failed`
 * code the renderer maps to a localized message; the domain stays i18n-agnostic.
 *
 * This is NOT the plan gate: switching between centers is the Premium
 * `org.multi-center` capability, and a locked plan surfaces as a
 * `PlanFeatureUnavailableError` from `SwitchCenter` before this can ever throw.
 */
export class CenterSwitchError extends DomainError {
  readonly code = 'center-switch-failed';
  constructor(readonly reason: string) {
    super(`Center switch failed: ${reason}`);
  }
}

/**
 * Provisioning a new center (SOU-310) could not complete: a fresh per-center DB
 * could not be created, migrated, or seeded. Carries a stable
 * `center-provisioning-failed` code the renderer maps to a localized message; the
 * domain stays i18n-agnostic.
 *
 * The provisioning adapter is contracted to leave no partial center behind — a
 * failed provision removes any half-written DB file — so this error always means
 * "nothing was created", never "a broken center now exists".
 *
 * This is NOT the plan gate: adding a center is the Premium `org.multi-center`
 * capability, and a locked plan surfaces as a `PlanFeatureUnavailableError` from
 * `CreateCenter` before provisioning is ever attempted.
 */
export class CenterProvisioningError extends DomainError {
  readonly code = 'center-provisioning-failed';
  constructor(readonly reason: string) {
    super(`Center provisioning failed: ${reason}`);
  }
}

/**
 * Joining an existing center from a hub (SOU-318) could not complete: the hub was
 * unreachable, the pairing token was rejected, the feed reconstructed no matching
 * center, or the local replica could not be created. Carries a stable
 * `center-join-failed` code the renderer maps to a localized message.
 *
 * Like provisioning, a failed join leaves nothing behind — the adapter removes any
 * half-written DB + client config — so this always means "nothing was created",
 * never "a broken center now exists". NOT the plan gate: joining requires
 * `sync.multi-device`, which surfaces as a `PlanFeatureUnavailableError` from
 * `JoinCenter` before the hub is ever contacted.
 */
export class CenterJoinError extends DomainError {
  readonly code: CenterJoinErrorCode = 'center-join-failed';
  constructor(readonly reason: string) {
    super(`Center join failed: ${reason}`);
  }
}

/**
 * The stable codes a failed join can carry. Only `code` and `message` survive the
 * IPC hop (`shared/ipc/domain-error`), so the reason a join failed has to BE the
 * code — a joining director otherwise sees one generic "connexion échouée" whether
 * they mistyped the pairing code, the host is behind a firewall, or the address
 * discovery offered belongs to an adapter the hub never bound. Those three need
 * three different actions from the human, so they get three different codes.
 */
export type CenterJoinErrorCode =
  | 'center-join-failed'
  | 'center-join-unreachable'
  | 'center-join-unauthorized'
  | 'center-join-wrong-center';

/**
 * No candidate address answered. Distinct from a rejected token: the hub was never
 * reached at all, so the fix is network-shaped (host laptop asleep, firewall
 * blocking the port, the two laptops on different networks) — never "retype the
 * code". Carries every address tried so the UI can name them.
 */
export class CenterJoinUnreachableError extends CenterJoinError {
  override readonly code = 'center-join-unreachable';
  constructor(readonly attemptedAddresses: readonly string[]) {
    super(`no hub answered at ${attemptedAddresses.join(', ')}`);
  }
}

/** The hub answered and rejected the pairing token — the one case where retyping
 *  the code is the right next step. */
export class CenterJoinUnauthorizedError extends CenterJoinError {
  override readonly code = 'center-join-unauthorized';
  constructor(readonly address: string) {
    super(`the hub at ${address} rejected the pairing code`);
  }
}

/** The hub answered, authenticated, and served a different center than the one the
 *  joiner picked — a real mix-up on a LAN hosting more than one center. */
export class CenterJoinWrongCenterError extends CenterJoinError {
  override readonly code = 'center-join-wrong-center';
  constructor(readonly servedCenterCode: string) {
    super(`the hub served a different center (${servedCenterCode})`);
  }
}

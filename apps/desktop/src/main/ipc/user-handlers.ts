import type {
  CenterCode,
  CreateUser,
  DeviceId,
  RedeemSetupCode,
  ValidateSetupCode,
  ReissueSetupCode,
  RecoverPasswordWithSetupCode,
  User,
  UserId,
} from '@centresoutien/domain';
import {
  NotAuthenticatedError,
  requireRole,
  canLogin,
  isSetupCodePending,
  hasEstablishedIdentity,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { SessionPrincipal } from '../session/session-principal';

export type CreateUserUseCase = Pick<CreateUser, 'execute'>;
export type RedeemSetupCodeUseCase = Pick<RedeemSetupCode, 'execute'>;
export type ValidateSetupCodeUseCase = Pick<ValidateSetupCode, 'execute'>;
export type ReissueSetupCodeUseCase = Pick<ReissueSetupCode, 'execute'>;
export type RecoverPasswordUseCase = Pick<RecoverPasswordWithSetupCode, 'execute'>;

// The center/device/user envelope stamped on every write; structurally the same
// object `handlers.ts` builds, kept local so this module owns no import cycle.
export type UserEnvelopeContext = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

export type UserHandlerDeps = {
  // Resolve the trusted session principal (SOU-265) from the remembered session,
  // refreshing the envelope's cached identity as a side effect. Returns `null`
  // when no authenticated principal can be established (no/expired/legacy session,
  // or a removed user). The director-only role guard reads this per call.
  resolvePrincipal: () => Promise<SessionPrincipal | null>;
  createUser: CreateUserUseCase;
  redeemSetupCode: RedeemSetupCodeUseCase;
  validateSetupCode: ValidateSetupCodeUseCase;
  reissueSetupCode: ReissueSetupCodeUseCase;
  recoverPassword: RecoverPasswordUseCase;
  listUsers: () => Promise<readonly User[]>;
  envelopeContext: () => UserEnvelopeContext;
  now: () => Date;
};

// A user's login-readiness as the roster renders it (SOU-256): `active` once a
// password exists, `setup-pending` while the invite code is still redeemable, and
// `setup-expired` for an invite whose code lapsed before redemption — the latter
// has no password and cannot log in, so it must read distinctly from `active`.
function userAccountStatus(user: User, now: Date): 'active' | 'setup-pending' | 'setup-expired' {
  if (canLogin(user)) return 'active';
  if (isSetupCodePending(user, now)) return 'setup-pending';
  return 'setup-expired';
}

// Project a User to its boundary DTO (SOU-256/SOU-303): credential material NEVER
// crosses the boundary — `passwordHash`, `setupCodeHash`, and the raw setup code
// are stripped. A not-yet-onboarded invite carries a placeholder username (its id),
// which is never surfaced — `username`/`fullName` are `null` until the staff redeem
// the code and choose their own identity; the roster renders the pending state from
// `status` instead.
function toUserView(user: User, now: Date) {
  const onboarded = hasEstablishedIdentity(user);
  return {
    id: user.id,
    username: onboarded ? user.username : null,
    fullName: user.fullName,
    role: user.role,
    status: userAccountStatus(user, now),
  };
}

// The director-only authorization gate (SOU-265) for the user-management channels.
// Renderer visibility is not a boundary — the preload bridge exposes these channels
// directly — so main enforces the real check: an established principal (else
// NotAuthenticatedError) whose role is `admin` or higher (else InsufficientRoleError,
// which the shared error-code transport carries to the renderer as `insufficient-role`).
// A legacy/expired/unknown session resolves to `null` and is rejected as
// unauthenticated: the device must log in again to re-establish who it is. The
// resolved principal is RETURNED so guarded writes stamp `updatedBy` from it
// directly, never re-reading the mutable cache after another await could have
// changed it (a concurrent logout would otherwise mis-attribute the write).
async function requireDirector(
  deps: Pick<UserHandlerDeps, 'resolvePrincipal'>,
): Promise<SessionPrincipal> {
  const principal = await deps.resolvePrincipal();
  if (principal === null) throw new NotAuthenticatedError();
  requireRole(principal.role, 'admin');
  return principal;
}

// User-management IPC handlers (SOU-256, role-scoped in SOU-265), split out of
// `handlers.ts` like the other channel factories. The director gate runs in main,
// before the use case, and is unbypassable — the renderer never carries identity.
export function createUserHandlers(
  deps: UserHandlerDeps,
): Pick<
  IpcHandlers,
  | 'user.create'
  | 'user.validateSetupCode'
  | 'user.redeemSetupCode'
  | 'user.reissueSetupCode'
  | 'user.recoverPassword'
  | 'user.list'
> {
  return {
    'user.create': async (request) => {
      // Creating staff is director-only work. Renderer visibility is not an
      // authorization boundary — the preload bridge exposes this channel directly,
      // so a logged-out renderer could otherwise mint an employee with a password of
      // its choosing and gain access with no prior credential. Only owner/admin may
      // create; secretary/viewer are rejected. The write is attributed to the
      // authorized principal returned by the guard, not the global cache, closing
      // the auth-then-stamp race (SOU-265).
      const principal = await requireDirector(deps);
      const { user } = await deps.createUser.execute({
        ...request,
        ...deps.envelopeContext(),
        updatedBy: principal.userId,
      });
      return { user: toUserView(user, deps.now()) };
    },
    // Intentionally unauthenticated (SOU-303): step 1 of the code-first flow. The
    // invited staff prove the code alone, before typing any identity; the response
    // carries the role bound to the code (never self-asserted) and whether identity
    // must still be collected. Invalid/expired codes surface via the error-code
    // transport, identically to redemption, so this leaks no more than step 2.
    'user.validateSetupCode': async (request) => {
      return deps.validateSetupCode.execute(request);
    },
    // Intentionally unauthenticated: this IS the first-login flow — the invited
    // employee has no session yet. Single-use + expiry are enforced in the domain.
    'user.redeemSetupCode': async (request) => {
      await deps.redeemSetupCode.execute(request);
      return { ok: true };
    },
    // Director-only recovery (SOU-303): re-open an existing user's setup code so
    // they can set a new password when self-service reset can't run. Inviting-guard
    // parity — this mints a hand-over code, exactly like user.create — so the same
    // owner/admin gate applies. The write is attributed to the authorized principal.
    'user.reissueSetupCode': async (request) => {
      const principal = await requireDirector(deps);
      const { user, setupCode } = await deps.reissueSetupCode.execute({
        userId: request.userId as User['id'],
        updatedBy: principal.userId,
      });
      return { user: toUserView(user, deps.now()), setupCode };
    },
    // Intentionally unauthenticated: an already-onboarded staff member redeems a
    // director-reissued code to set a NEW password. No identity is re-collected;
    // single-use + expiry are enforced in the domain.
    'user.recoverPassword': async (request) => {
      await deps.recoverPassword.execute(request);
      return { ok: true };
    },
    'user.list': async () => {
      // Director-only (SOU-265): the team roster is owner/admin-visible only.
      await requireDirector(deps);
      const users = await deps.listUsers();
      const now = deps.now();
      return { users: users.map((user) => toUserView(user, now)) };
    },
  };
}

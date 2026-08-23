import type {
  ResetPasswordAfterEmailVerification,
  SetOwnerEmail,
} from '@centresoutien/domain';
import { NotAuthenticatedError, requireRole } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';
import type { SessionPrincipal } from '../session/session-principal';
import type { EmailResetRelay } from '../../data/relay/email-reset-relay';

export type SetOwnerEmailUseCase = Pick<SetOwnerEmail, 'execute'>;
export type ResetPasswordAfterEmailVerificationUseCase = Pick<
  ResetPasswordAfterEmailVerification,
  'execute'
>;

// The single owner's identity the online reset needs (SOU-273): `email` is the
// mailbox the relay verifies, `accountId`/`centerCode` scope the relay's code, and
// `username` attributes the local reset's audit rows. `email` is `null` when the
// owner never set a contact address.
export type OwnerResetIdentity = {
  readonly username: string;
  readonly accountId: string;
  readonly centerCode: string;
  readonly email: string | null;
};

export type EmailResetHandlerDeps = {
  // Owner-only guard for the settings-side owner-email reads/writes (SOU-273).
  // Reused from the session-principal control surface; `null` when no authenticated
  // principal can be established.
  resolvePrincipal: () => Promise<SessionPrincipal | null>;
  setOwnerEmail: SetOwnerEmailUseCase;
  resetPasswordAfterEmailVerification: ResetPasswordAfterEmailVerificationUseCase;
  // The owner's identity for the pre-auth reset channels, resolved locally (the
  // center DB is open at the login screen); never sent by the renderer.
  ownerResetIdentity: () => Promise<OwnerResetIdentity | null>;
  emailResetRelay: EmailResetRelay;
  // Drop the in-memory principal after the reset invalidated the device session.
  clearPrincipal: () => void;
};

// The owner is the single director; setting or reading the account's contact email
// is owner-only work. Renderer visibility is cosmetic — the preload bridge exposes
// these channels directly — so main enforces the real check: an established
// principal (else NotAuthenticatedError) whose role is `owner` (else the shared
// error-code transport carries `insufficient-role` to the renderer).
async function requireOwner(
  deps: Pick<EmailResetHandlerDeps, 'resolvePrincipal'>,
): Promise<SessionPrincipal> {
  const principal = await deps.resolvePrincipal();
  if (principal === null) throw new NotAuthenticatedError();
  requireRole(principal.role, 'owner');
  return principal;
}

// Owner contact-email settings + the online email password-reset flow (SOU-273).
// The relay call and the local reset both run HERE, in main: the renderer never
// holds a standalone "reset the password now" capability — it can only ask main to
// verify a mailbox code and, on success, rotate the credential atomically.
export function createEmailResetHandlers(
  deps: EmailResetHandlerDeps,
): Pick<
  IpcHandlers,
  'account.ownerEmail.get' | 'account.ownerEmail.set' | 'auth.emailReset.request' | 'auth.emailReset.confirm'
> {
  return {
    'account.ownerEmail.get': async () => {
      await requireOwner(deps);
      const identity = await deps.ownerResetIdentity();
      return { email: identity?.email ?? null };
    },

    'account.ownerEmail.set': async (request) => {
      await requireOwner(deps);
      const owner = await deps.setOwnerEmail.execute({ email: request.email });
      return { email: owner.email ?? null };
    },

    // Intentionally unauthenticated: the owner asking for a reset is locked out —
    // that is the point. Resolves the owner's stored email locally and asks the
    // relay to mail a code. `no-email` short-circuits before any network call when
    // no contact address is on file (the UI hides the option then, but the boundary
    // is not a UI).
    'auth.emailReset.request': async (request) => {
      const identity = await deps.ownerResetIdentity();
      if (identity === null || identity.email === null) return { outcome: 'no-email' };

      const outcome = await deps.emailResetRelay.requestReset({
        email: identity.email,
        accountId: identity.accountId,
        centerCode: identity.centerCode,
        locale: request.locale,
      });
      switch (outcome) {
        case 'sent':
          return { outcome: 'sent' };
        case 'rate-limited':
          return { outcome: 'rate-limited' };
        case 'unreachable':
          return { outcome: 'unreachable' };
        default: {
          const exhaustive: never = outcome;
          throw new Error(`unexpected email-reset request outcome: ${String(exhaustive)}`);
        }
      }
    },

    // Intentionally unauthenticated. Verifies the mailbox code with the relay and
    // ONLY on `confirmed` runs the local password reset (which invalidates the
    // remembered session); the stale in-memory principal is then dropped.
    'auth.emailReset.confirm': async (request) => {
      const identity = await deps.ownerResetIdentity();
      if (identity === null || identity.email === null) return { outcome: 'invalid-or-expired' };

      const outcome = await deps.emailResetRelay.confirmReset({
        email: identity.email,
        accountId: identity.accountId,
        code: request.code,
      });
      switch (outcome) {
        case 'confirmed':
          await deps.resetPasswordAfterEmailVerification.execute({
            newPassword: request.password,
            username: identity.username,
          });
          deps.clearPrincipal();
          return { outcome: 'success' };
        case 'invalid-or-expired':
          return { outcome: 'invalid-or-expired' };
        case 'rate-limited':
          return { outcome: 'rate-limited' };
        case 'unreachable':
          return { outcome: 'unreachable' };
        default: {
          const exhaustive: never = outcome;
          throw new Error(`unexpected email-reset confirm outcome: ${String(exhaustive)}`);
        }
      }
    },
  };
}

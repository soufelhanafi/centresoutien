import type { Clock } from '../ports/clock';
import type { LoginThrottleStore } from '../ports/login-throttle-store';
import type { LoginThrottlePolicy } from '../policies/login-throttle-policy';
import type { DeviceSessionService } from '../services/device-session-service';
import type { Role } from '../value-objects/role';
import type { UserId } from '../value-objects/ids';
import { loginInputSchema, type LoginInput } from '../schemas/login';

// The identity a successful login resolves — who signed in and at what role.
// Published as the SOU-252 contract the presentation layer consumes to scope the
// session (SOU-256): the login screen no longer just learns "in", it learns which
// user and role are now active.
export type AuthenticatedUser = {
  readonly userId: UserId;
  readonly username: string;
  readonly role: Role;
};

// Verifies a credential pair, returning the AuthenticatedUser on a match or `null`
// otherwise. Implemented by `VerifyUserPassword`; stubbed in tests.
export interface CredentialVerifier {
  execute(input: { username: string; password: string }): Promise<AuthenticatedUser | null>;
}

// The outcome of a login attempt. A discriminated union rather than a boolean: the
// login screen shows three distinct states (in, wrong-with-tries-left,
// locked-with-countdown), and the caller must not have to infer them. `success`
// carries the resolved AuthenticatedUser so the session knows who is in.
export type LoginResult =
  | { readonly outcome: 'success'; readonly user: AuthenticatedUser }
  | { readonly outcome: 'invalid-credentials'; readonly remainingAttempts: number }
  // `lockedUntil` is epoch millis (UTC) — the boundary forwards it as-is.
  | { readonly outcome: 'locked-out'; readonly lockedUntil: number };

// A throttled login attempt (SOU-27, multi-user in SOU-252). Wraps the pure
// `VerifyUserPassword` credential check with attempt counting, a lockout on the
// 6th consecutive failure (15-minute cooldown) persisted in the DB, and
// remembered-device sessions.
//
// A locked console short-circuits before verification, so a wrong password never
// pays the Argon2 cost while locked and every failed try — wrong username or wrong
// password — counts equally toward the shared console's lock.
export class AttemptLogin {
  constructor(
    private readonly verify: CredentialVerifier,
    private readonly throttle: LoginThrottleStore,
    private readonly policy: LoginThrottlePolicy,
    private readonly sessions: DeviceSessionService,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const { username, password, rememberDevice } = loginInputSchema.parse(input);
    const now = this.clock.now();

    const state = await this.throttle.get();
    const lockedUntil = this.policy.lockActiveUntil(state, now);
    if (lockedUntil !== null) return { outcome: 'locked-out', lockedUntil };

    const user = await this.verify.execute({ username, password });
    if (user !== null) {
      await this.throttle.reset();
      if (rememberDevice) await this.sessions.remember();
      else await this.sessions.forget();
      return { outcome: 'success', user };
    }

    const next = this.policy.registerFailure(state, now);
    await this.throttle.save(next);
    const lockedAfter = this.policy.lockActiveUntil(next, now);
    if (lockedAfter !== null) return { outcome: 'locked-out', lockedUntil: lockedAfter };
    return { outcome: 'invalid-credentials', remainingAttempts: this.policy.remainingAttempts(next) };
  }
}

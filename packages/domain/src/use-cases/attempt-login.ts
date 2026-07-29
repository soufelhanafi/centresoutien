import type { Clock } from '../ports/clock';
import type { LoginThrottleStore } from '../ports/login-throttle-store';
import type { LoginThrottlePolicy } from '../policies/login-throttle-policy';
import type { DeviceSessionService } from '../services/device-session-service';
import { loginInputSchema, type LoginInput } from '../schemas/login';
import type { VerifyAdminPassword } from './verify-admin-password';

/** Verifies a credential pair, returning true on a match. Stubbed in tests. */
export type CredentialVerifier = Pick<VerifyAdminPassword, 'execute'>;

/**
 * The outcome of a login attempt. A discriminated union rather than a boolean:
 * the login screen shows three distinct states (in, wrong-with-tries-left,
 * locked-with-countdown), and the caller must not have to infer them.
 */
export type LoginResult =
  | { readonly outcome: 'success' }
  | { readonly outcome: 'invalid-credentials'; readonly remainingAttempts: number }
  | { readonly outcome: 'locked-out'; readonly lockedUntil: Date };

/**
 * A throttled login attempt for the local admin console (SOU-27). Wraps the pure
 * {@link VerifyAdminPassword} credential check with attempt counting, a 5-try /
 * 15-minute lockout persisted in the DB, and remembered-device sessions.
 *
 * A locked console short-circuits before verification, so a wrong password never
 * pays the Argon2 cost while locked and every failed try — wrong username or
 * wrong password — counts equally toward the single local console's lock.
 */
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
    if (lockedUntil) return { outcome: 'locked-out', lockedUntil };

    if (await this.verify.execute({ username, password })) {
      await this.throttle.reset();
      if (rememberDevice) await this.sessions.remember();
      else await this.sessions.forget();
      return { outcome: 'success' };
    }

    const next = this.policy.registerFailure(state, now);
    await this.throttle.save(next);
    const lockedAfter = this.policy.lockActiveUntil(next, now);
    if (lockedAfter) return { outcome: 'locked-out', lockedUntil: lockedAfter };
    return { outcome: 'invalid-credentials', remainingAttempts: this.policy.remainingAttempts(next) };
  }
}

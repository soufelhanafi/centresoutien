import { describe, it, expect, beforeEach } from 'vitest';
import { CreateAdminAccount } from '../../../src/use-cases/create-admin-account';
import { VerifyAdminPassword } from '../../../src/use-cases/verify-admin-password';
import { AttemptLogin } from '../../../src/use-cases/attempt-login';
import { DeviceSessionService } from '../../../src/services/device-session-service';
import {
  LoginThrottlePolicy,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from '../../../src/policies/login-throttle-policy';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { InMemoryLoginThrottleStore } from '../fakes/in-memory-login-throttle-store';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const USERNAME = 'directrice';
const PASSWORD = 'Casa2026!';
const WRONG = 'Wrong2026!';

/** Wire a full login stack sharing one clock so time can be advanced in tests. */
async function makeLogin() {
  const accounts = new InMemoryAdminAccountRepository();
  const throttleStore = new InMemoryLoginThrottleStore();
  const sessionStore = new InMemoryDeviceSessionStore();
  const hasher = fakeHasher();
  const clock = fakeClock('2026-07-28T10:00:00Z');

  await new CreateAdminAccount(accounts, hasher, clock, fakeIds()).execute({
    username: USERNAME,
    password: PASSWORD,
  });

  const sessions = new DeviceSessionService(sessionStore, clock, fakeIds());
  const login = new AttemptLogin(
    new VerifyAdminPassword(accounts, hasher),
    throttleStore,
    new LoginThrottlePolicy(),
    sessions,
    clock,
  );
  return { login, sessionStore, clock };
}

describe('AttemptLogin', () => {
  let login: AttemptLogin;
  let sessionStore: InMemoryDeviceSessionStore;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(async () => {
    ({ login, sessionStore, clock } = await makeLogin());
  });

  it('succeeds with correct credentials', async () => {
    const result = await login.execute({ username: USERNAME, password: PASSWORD });
    expect(result).toEqual({ outcome: 'success' });
  });

  it('remembers the device only when the toggle is on', async () => {
    await login.execute({ username: USERNAME, password: PASSWORD, rememberDevice: true });
    expect(await sessionStore.getCurrent()).not.toBeNull();
  });

  it('does not persist a session when remember is off, and clears a stale one', async () => {
    await login.execute({ username: USERNAME, password: PASSWORD, rememberDevice: true });
    await login.execute({ username: USERNAME, password: PASSWORD, rememberDevice: false });
    expect(await sessionStore.getCurrent()).toBeNull();
  });

  it('reports remaining attempts on a wrong password', async () => {
    const result = await login.execute({ username: USERNAME, password: WRONG });
    expect(result).toEqual({
      outcome: 'invalid-credentials',
      remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
    });
  });

  it('locks the console on the sixth wrong try and blocks the seventh', async () => {
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      const r = await login.execute({ username: USERNAME, password: WRONG });
      expect(r.outcome).toBe('invalid-credentials');
    }

    const sixth = await login.execute({ username: USERNAME, password: WRONG });
    expect(sixth.outcome).toBe('locked-out');

    // Seventh try is blocked before the password is even checked — a correct
    // password does not get you in while locked.
    const seventh = await login.execute({ username: USERNAME, password: PASSWORD });
    expect(seventh).toMatchObject({ outcome: 'locked-out' });
  });

  it('exposes a lockedUntil 15 minutes ahead', async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await login.execute({ username: USERNAME, password: WRONG });
    }
    const result = await login.execute({ username: USERNAME, password: PASSWORD });
    if (result.outcome !== 'locked-out') throw new Error('expected locked-out');
    expect(result.lockedUntil).toBe(clock.now().getTime() + LOCKOUT_DURATION_MS);
  });

  it('lets the user back in after the cooldown elapses', async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await login.execute({ username: USERNAME, password: WRONG });
    }
    clock.advance(LOCKOUT_DURATION_MS + 1);

    const result = await login.execute({ username: USERNAME, password: PASSWORD });
    expect(result).toEqual({ outcome: 'success' });
  });

  it('gives a full fresh set of attempts after the cooldown', async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      await login.execute({ username: USERNAME, password: WRONG });
    }
    clock.advance(LOCKOUT_DURATION_MS + 1);

    const result = await login.execute({ username: USERNAME, password: WRONG });
    expect(result).toEqual({
      outcome: 'invalid-credentials',
      remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
    });
  });

  it('resets the failure count after a success', async () => {
    await login.execute({ username: USERNAME, password: WRONG });
    await login.execute({ username: USERNAME, password: PASSWORD });

    const result = await login.execute({ username: USERNAME, password: WRONG });
    expect(result).toEqual({
      outcome: 'invalid-credentials',
      remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
    });
  });

  it('counts an unknown username as a failed attempt', async () => {
    const result = await login.execute({ username: 'ghost', password: PASSWORD });
    expect(result).toEqual({
      outcome: 'invalid-credentials',
      remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
    });
  });
});

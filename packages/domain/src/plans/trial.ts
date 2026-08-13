/** A center gets one personal-sale trial, lasting exactly fourteen UTC days. */
export const TRIAL_DURATION_DAYS = 14;

/** Device-local trial state. It is intentionally not a synced entity. */
export type CenterTrial = {
  readonly startedAt: Date;
  readonly lastSeenAt: Date;
};

/** Creates the initial local trial state without persisting it. */
export function newCenterTrial(now: Date): CenterTrial {
  return { startedAt: now, lastSeenAt: now };
}

export type CenterTrialResolution = {
  readonly status: 'active' | 'expired';
  readonly restricted: boolean;
  readonly expiresAt: Date;
  readonly effectiveNow: Date;
};

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Resolves a trial with a small offline-clock safeguard. A previously observed
 * timestamp is a floor, so setting a laptop clock backwards cannot extend the
 * trial. This intentionally remains local, lightweight honest-user enforcement.
 */
export function resolveCenterTrial(trial: CenterTrial, now: Date): CenterTrialResolution {
  const effectiveNow = now.getTime() > trial.lastSeenAt.getTime() ? now : trial.lastSeenAt;
  const expiresAt = addUtcDays(trial.startedAt, TRIAL_DURATION_DAYS);
  const active = effectiveNow.getTime() < expiresAt.getTime();
  return { status: active ? 'active' : 'expired', restricted: !active, expiresAt, effectiveNow };
}

import { describe, expect, it } from 'vitest';
import {
  TRIAL_DURATION_DAYS,
  resolveCenterTrial,
  type CenterTrial,
} from '../../../src/plans/trial';

const STARTED_AT = new Date('2026-08-01T10:00:00.000Z');

function trial(overrides: Partial<CenterTrial> = {}): CenterTrial {
  return { startedAt: STARTED_AT, lastSeenAt: STARTED_AT, ...overrides };
}

describe('resolveCenterTrial', () => {
  it('grants the full 14-day period and expires at the start of day 15', () => {
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(resolveCenterTrial(trial(), new Date('2026-08-15T09:59:59.999Z'))).toMatchObject({
      status: 'active',
      restricted: false,
      expiresAt: '2026-08-15T10:00:00.000Z',
    });
    expect(resolveCenterTrial(trial(), new Date('2026-08-15T10:00:00.000Z'))).toMatchObject({
      status: 'expired',
      restricted: true,
    });
  });

  it('uses the last observed timestamp when the offline machine clock moves backwards', () => {
    const result = resolveCenterTrial(
      trial({ lastSeenAt: new Date('2026-08-15T10:00:00.000Z') }),
      new Date('2026-08-05T10:00:00.000Z'),
    );

    expect(result).toMatchObject({
      status: 'expired',
      effectiveNow: new Date('2026-08-15T10:00:00.000Z'),
    });
  });

  it('does not let a future last-observed timestamp shorten a newly started trial', () => {
    const result = resolveCenterTrial(
      trial({ lastSeenAt: new Date('2026-09-01T10:00:00.000Z') }),
      new Date('2026-08-01T10:00:00.000Z'),
    );

    expect(result.status).toBe('expired');
  });
});

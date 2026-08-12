import { describe, it, expect } from 'vitest';
import {
  resolveUpdaterCapability,
  isCheckDue,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
} from '../../../src/main/updater/update-policy';

describe('resolveUpdaterCapability', () => {
  it('disables the updater entirely when not packaged (dev / e2e)', () => {
    expect(resolveUpdaterCapability({ isPackaged: false, platform: 'win32', isMacSigned: true }))
      .toEqual({ enabled: false, canApply: false });
  });

  it('enables and can apply on packaged Windows', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'win32', isMacSigned: false }))
      .toEqual({ enabled: true, canApply: true });
  });

  it('enables check-only on packaged unsigned macOS (cannot apply)', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'darwin', isMacSigned: false }))
      .toEqual({ enabled: true, canApply: false });
  });

  it('enables and can apply on packaged signed macOS', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'darwin', isMacSigned: true }))
      .toEqual({ enabled: true, canApply: true });
  });

  it('disables on Linux', () => {
    expect(resolveUpdaterCapability({ isPackaged: true, platform: 'linux', isMacSigned: true }))
      .toEqual({ enabled: false, canApply: false });
  });
});

describe('isCheckDue', () => {
  it('is due on the first check when no prior check recorded', () => {
    expect(isCheckDue({ lastCheckAt: null, now: 1_000, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(true);
  });

  it('is due once the interval has elapsed', () => {
    expect(isCheckDue({ lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(true);
  });

  it('is not due before the interval elapses', () => {
    expect(isCheckDue({ lastCheckAt: 0, now: UPDATE_CHECK_INTERVAL_MS - 1, intervalMs: UPDATE_CHECK_INTERVAL_MS })).toBe(false);
  });

  it('exposes the cadence constants', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(21_600_000);
    expect(UPDATE_FIRST_CHECK_DELAY_MS).toBe(10_000);
  });
});

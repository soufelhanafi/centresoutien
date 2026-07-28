import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../../src/main/infra/system-clock';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current wall-clock time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T10:00:00Z'));
    expect(new SystemClock().now()).toEqual(new Date('2026-07-28T10:00:00Z'));
  });
});

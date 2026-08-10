import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTodayIsoDate } from '../../src/renderer/hooks/use-today-iso-date';
import * as dates from '../../src/renderer/lib/center-hours-overrides/dates';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTodayIsoDate', () => {
  it('returns the current civil date at mount', () => {
    vi.spyOn(dates, 'todayIsoDate').mockReturnValue('2026-03-10');
    const { result } = renderHook(() => useTodayIsoDate());
    expect(result.current).toBe('2026-03-10');
  });

  it('advances when the window regains focus after local midnight', () => {
    const clock = vi.spyOn(dates, 'todayIsoDate').mockReturnValue('2026-03-10');
    const { result } = renderHook(() => useTodayIsoDate());
    clock.mockReturnValue('2026-03-11');
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2026-03-11');
  });

  it('advances on visibilitychange', () => {
    const clock = vi.spyOn(dates, 'todayIsoDate').mockReturnValue('2026-03-10');
    const { result } = renderHook(() => useTodayIsoDate());
    clock.mockReturnValue('2026-03-11');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('2026-03-11');
  });

  it('keeps the same date when nothing rolled over', () => {
    vi.spyOn(dates, 'todayIsoDate').mockReturnValue('2026-03-10');
    const { result } = renderHook(() => useTodayIsoDate());
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2026-03-10');
  });
});

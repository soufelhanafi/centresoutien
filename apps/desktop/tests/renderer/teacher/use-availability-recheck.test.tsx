import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvailabilityRecheck } from '../../../src/renderer/hooks/teacher-availability/use-availability-recheck';
import type {
  AvailabilityRecheckResult,
  OutOfWindowOccurrenceView,
} from '../../../src/renderer/lib/teacher-availability/availability-recheck-gateway';

const { listOutOfWindowSessions } = vi.hoisted(() => ({
  listOutOfWindowSessions: vi.fn<(teacherId: string) => Promise<AvailabilityRecheckResult>>(),
}));

vi.mock('../../../src/renderer/lib/teacher-availability/availability-recheck-gateway', () => ({
  availabilityRecheckGateway: { listOutOfWindowSessions },
}));

const OCCURRENCE: OutOfWindowOccurrenceView = {
  sessionId: 'ses_1',
  subjectName: { fr: 'Physique — Bac', ar: 'فيزياء — باك' },
  teacherName: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
  date: '2026-09-14',
  start: '15:00',
  end: '16:30',
};

const EMPTY: AvailabilityRecheckResult = { sessions: [], occurrences: [] };
const STRANDED: AvailabilityRecheckResult = { sessions: [], occurrences: [OCCURRENCE] };

describe('useAvailabilityRecheck', () => {
  beforeEach(() => {
    listOutOfWindowSessions.mockReset();
  });

  it('opens the popup with the stranded occurrences it finds', async () => {
    listOutOfWindowSessions.mockResolvedValueOnce(STRANDED);
    const { result } = renderHook(() => useAvailabilityRecheck('tea_1'));

    await act(() => result.current.check());

    expect(result.current.open).toBe(true);
    expect(result.current.occurrences).toEqual([OCCURRENCE]);
  });

  it('ignores a slower older response once a newer check has resolved', async () => {
    let resolveFirst: (value: AvailabilityRecheckResult) => void = () => {};
    listOutOfWindowSessions
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(STRANDED);
    const { result } = renderHook(() => useAvailabilityRecheck('tea_1'));

    let firstCheck: Promise<void>;
    act(() => {
      firstCheck = result.current.check();
    });
    await act(() => result.current.check());
    await act(async () => {
      resolveFirst(EMPTY);
      await firstCheck;
    });

    expect(result.current.open).toBe(true);
    expect(result.current.occurrences).toEqual([OCCURRENCE]);
  });

  it('clears and closes a stale popup when the newest response is empty', async () => {
    listOutOfWindowSessions.mockResolvedValueOnce(STRANDED).mockResolvedValueOnce(EMPTY);
    const { result } = renderHook(() => useAvailabilityRecheck('tea_1'));

    await act(() => result.current.check());
    expect(result.current.open).toBe(true);

    await act(() => result.current.check());

    await waitFor(() => expect(result.current.open).toBe(false));
    expect(result.current.occurrences).toEqual([]);
  });

  it('leaves state untouched when the recheck read fails', async () => {
    listOutOfWindowSessions.mockRejectedValueOnce(new Error('ipc down'));
    const { result } = renderHook(() => useAvailabilityRecheck('tea_1'));

    await act(() => result.current.check());

    expect(result.current.open).toBe(false);
    expect(result.current.occurrences).toEqual([]);
  });
});

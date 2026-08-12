import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useRunSync, useResolveConflict } from '../../../src/renderer/hooks/sync/use-sync';
import { studentKeys } from '../../../src/renderer/hooks/student/keys';

const STUDENT_COUNT_LABEL = 'active students';

function StudentCount({ fetchCount }: { fetchCount: () => Promise<number> }) {
  const { data } = useQuery({ queryKey: studentKeys.list(''), queryFn: fetchCount });
  return <output aria-label={STUDENT_COUNT_LABEL}>{data ?? 'loading'}</output>;
}

function RunSyncTrigger() {
  const runSync = useRunSync();
  return (
    <button type="button" onClick={() => runSync.mutate()}>
      {runSync.isSuccess ? 'run settled' : 'run'}
    </button>
  );
}

function ResolveConflictTrigger() {
  const resolveConflict = useResolveConflict();
  return (
    <button
      type="button"
      onClick={() =>
        resolveConflict.mutate({
          entityType: 'student',
          entityId: 'stu-1',
          resolution: { choice: 'take-mine' },
        })
      }
    >
      resolve
    </button>
  );
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function countingFetcher(): () => Promise<number> {
  let calls = 0;
  return () => {
    calls += 1;
    return Promise.resolve(calls);
  };
}

function studentCount(): HTMLElement {
  return screen.getByLabelText(STUDENT_COUNT_LABEL);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('use-sync — post-sync cache invalidation (SOU-234)', () => {
  it('refetches a mounted domain query after a successful sync run', async () => {
    window.api.invoke = vi.fn(async () => ({
      result: {
        status: 'synced',
        applied: 3,
        pushed: 0,
        conflicts: [],
        deviceClockSkew: false,
        resolutionPermission: 'granted',
      },
    }));

    render(
      <QueryClientProvider client={newClient()}>
        <StudentCount fetchCount={countingFetcher()} />
        <RunSyncTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(studentCount()).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'run' }).click();

    await waitFor(() => expect(studentCount()).toHaveTextContent('2'));
  });

  it('does not invalidate when the run returns no result (plan-locked / no hub)', async () => {
    window.api.invoke = vi.fn(async () => ({ result: null }));
    const fetchCount = vi.fn(countingFetcher());

    render(
      <QueryClientProvider client={newClient()}>
        <StudentCount fetchCount={fetchCount} />
        <RunSyncTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(studentCount()).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'run' }).click();

    await waitFor(() => screen.getByRole('button', { name: 'run settled' }));
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(studentCount()).toHaveTextContent('1');
  });

  it('refetches a mounted domain query after resolving a conflict', async () => {
    window.api.invoke = vi.fn(async () => ({ ok: true }));

    render(
      <QueryClientProvider client={newClient()}>
        <StudentCount fetchCount={countingFetcher()} />
        <ResolveConflictTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(studentCount()).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'resolve' }).click();

    await waitFor(() => expect(studentCount()).toHaveTextContent('2'));
  });
});

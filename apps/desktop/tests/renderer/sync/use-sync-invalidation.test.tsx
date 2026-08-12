import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useRunSync, useResolveConflict } from '../../../src/renderer/hooks/sync/use-sync';
import { studentKeys } from '../../../src/renderer/hooks/student/keys';

function StudentCountConsumer({ fetchCount }: { fetchCount: () => Promise<number> }) {
  const { data } = useQuery({ queryKey: studentKeys.list(''), queryFn: fetchCount });
  return <span data-testid="count">{data ?? 'loading'}</span>;
}

function RunSyncTrigger() {
  const runSync = useRunSync();
  return (
    <button type="button" onClick={() => runSync.mutate()}>
      run
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
        <StudentCountConsumer fetchCount={countingFetcher()} />
        <RunSyncTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'run' }).click();

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });

  it('does not invalidate when the run returns no result (plan-locked / no hub)', async () => {
    window.api.invoke = vi.fn(async () => ({ result: null }));

    render(
      <QueryClientProvider client={newClient()}>
        <StudentCountConsumer fetchCount={countingFetcher()} />
        <RunSyncTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'run' }).click();

    await Promise.resolve();
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('refetches a mounted domain query after resolving a conflict', async () => {
    window.api.invoke = vi.fn(async () => ({ ok: true }));

    render(
      <QueryClientProvider client={newClient()}>
        <StudentCountConsumer fetchCount={countingFetcher()} />
        <ResolveConflictTrigger />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    screen.getByRole('button', { name: 'resolve' }).click();

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });
});

import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamSettings } from '../../../src/renderer/components/settings/team/team-settings';
import { usersGateway } from '../../../src/renderer/lib/users/users-gateway';
import { userKeys } from '../../../src/renderer/hooks/user/keys';
import type { UserView } from '../../../src/renderer/lib/users/user-view';
import i18n from '../../../src/renderer/i18n/config';

/**
 * SOU-303 regression: the team roster must survive a failing background refetch.
 * A re-login unmounts and remounts the app subtree, so `useUsers` re-runs against
 * a still-cached roster and fires a fresh `user.list`. If that refetch errors,
 * the roster we already have must keep rendering (with the director's re-issue
 * action) — never collapse to a full-page error. With the shared `retry:false`
 * client a single blip would otherwise strand the ErrorState and, in E2E, hide
 * the "Nouveau code" button the director needs (the S7 timeout).
 */

const OWNER: UserView = {
  id: 'usr_00000000000000000000000001',
  username: 'directrice',
  fullName: null,
  role: 'owner',
  status: 'active',
};
const SECRETARY: UserView = {
  id: 'usr_00000000000000000000000002',
  username: 'fatima.secretaire',
  fullName: 'Fatima Zahra',
  role: 'secretary',
  status: 'active',
};

function renderWithCachedRoster(ui: ReactElement, roster: readonly UserView[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(userKeys.list, roster);
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TeamSettings — roster resilience to a failing refetch', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps rendering the cached roster (with the re-issue action) when the refetch errors', async () => {
    const list = vi
      .spyOn(usersGateway, 'list')
      .mockRejectedValue(new Error('transient user.list failure on re-login'));

    renderWithCachedRoster(<TeamSettings />, [OWNER, SECRETARY]);

    // The background refetch fires and fails...
    await waitFor(() => expect(list).toHaveBeenCalled());

    // ...but the roster we already had stays on screen, re-issue action included.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Nouveau code' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Fatima Zahra')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('team.loadError.title'))).not.toBeInTheDocument();
  });

  it('still shows the error state when the very first load fails with no cached roster', async () => {
    vi.spyOn(usersGateway, 'list').mockRejectedValue(new Error('cold-load failure'));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TeamSettings />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(i18n.t('team.loadError.title'))).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Nouveau code' })).not.toBeInTheDocument();
  });
});

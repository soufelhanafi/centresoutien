import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JoinCenterFlow } from '../../../src/renderer/components/wizard/join/join-center-flow';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';
import i18n from '../../../src/renderer/i18n/config';

function renderFlow() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <JoinCenterFlow />
    </QueryClientProvider>,
  );
}

const DISCOVERED = {
  name: 'Centre Al Amal — Casablanca',
  host: '192.168.1.24',
  port: 8787,
  centreId: 'ctr_casa_001',
  centerCode: 'CS-CASA-001',
};

beforeEach(async () => {
  useWizardStore.setState({ mode: 'join', state: null, adminUsername: '' });
  await i18n.changeLanguage('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('JoinCenterFlow — happy path (SOU-318)', () => {
  it('discovers → picks a center → enters the code → joins with the right request', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.discoverCenters') return { centers: [DISCOVERED] };
      if (channel === 'hub.joinCenter') return { ok: true, centreId: 'ctr_casa_001', centerCode: 'CS-CASA-001' };
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    // 1. Discovery lists the found center.
    await user.click(await screen.findByText('Centre Al Amal — Casablanca'));

    // 2. Pairing code step.
    const tokenInput = await screen.findByLabelText("Code d'appairage");
    await user.type(tokenInput, 'A1B2-C3D4-E5F6');
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));

    // 3. Join is requested with the discovered address + typed token.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('hub.joinCenter', {
        baseUrl: 'http://192.168.1.24:8787',
        token: 'A1B2-C3D4-E5F6',
        centerCode: 'CS-CASA-001',
      }),
    );
  });

  it('shows the empty state with a retry when no center answers', async () => {
    window.api.invoke = vi.fn(async () => ({ centers: [] }));
    renderFlow();

    expect(await screen.findByText('Aucun centre trouvé sur le réseau')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('joins a manually entered host when discovery finds nothing', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.discoverCenters') return { centers: [] };
      if (channel === 'hub.joinCenter') return { ok: true, centreId: 'ctr_x', centerCode: 'CS-X-001' };
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(await screen.findByText("Saisir l'adresse manuellement"));
    await user.type(screen.getByLabelText("Adresse de l'hôte"), '10.0.0.5');
    await user.type(screen.getByLabelText('Code du centre'), 'CS-X-001');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    await user.type(await screen.findByLabelText("Code d'appairage"), 'ZZZZ-ZZZZ-ZZZZ');
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('hub.joinCenter', {
        // The manual form pre-fills the host's default port (4747) — the user typed
        // only host + center code, so the request must carry 4747, not a stale default.
        baseUrl: 'http://10.0.0.5:4747',
        token: 'ZZZZ-ZZZZ-ZZZZ',
        centerCode: 'CS-X-001',
      }),
    );
  });
});

describe('JoinCenterFlow — live progress (45-minute-onboarding follow-up)', () => {
  it('shows the running applied count as the cold bootstrap reports progress', async () => {
    let progressListener: ((event: { applied: number }) => void) | null = null;
    window.api.onJoinProgress = (listener) => {
      progressListener = listener;
      return () => {
        progressListener = null;
      };
    };
    let resolveJoin: (value: unknown) => void = () => undefined;
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.discoverCenters') return { centers: [DISCOVERED] };
      if (channel === 'hub.joinCenter') {
        return new Promise((resolve) => {
          resolveJoin = resolve;
        });
      }
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(await screen.findByText('Centre Al Amal — Casablanca'));
    await user.type(await screen.findByLabelText("Code d'appairage"), 'A1B2-C3D4-E5F6');
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));

    // The join is in flight; nothing has reported progress yet.
    await screen.findByText('Récupération des données du centre…');
    expect(screen.queryByText(/éléments synchronisés/)).not.toBeInTheDocument();
    expect(progressListener).not.toBeNull();

    // The cold bootstrap reports its first page.
    progressListener?.({ applied: 4200 });
    expect(await screen.findByText('4200 éléments synchronisés…')).toBeInTheDocument();

    // A later page updates the same live count, not a second line.
    progressListener?.({ applied: 8600 });
    expect(await screen.findByText('8600 éléments synchronisés…')).toBeInTheDocument();
    expect(screen.queryByText('4200 éléments synchronisés…')).not.toBeInTheDocument();

    resolveJoin({ ok: true, centreId: 'ctr_casa_001', centerCode: 'CS-CASA-001' });
  });
});

describe('JoinCenterFlow — error path (SOU-318)', () => {
  it('maps a center-join-failed rejection to its localized message with retry', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'hub.discoverCenters') return { centers: [DISCOVERED] };
      if (channel === 'hub.joinCenter') {
        return Promise.reject(Object.assign(new Error('join failed'), { code: 'center-join-failed' }));
      }
      return {};
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderFlow();

    await user.click(await screen.findByText('Centre Al Amal — Casablanca'));
    await user.type(await screen.findByLabelText("Code d'appairage"), 'BAD-CODE-0000');
    await user.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(await screen.findByText('Impossible de rejoindre le centre')).toBeInTheDocument();
    expect(
      screen.getByText(
        "La connexion a échoué. Vérifiez le code d'appairage et que l'ordinateur hôte est bien accessible.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

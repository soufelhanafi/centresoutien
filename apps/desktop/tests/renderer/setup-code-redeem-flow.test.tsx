import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupCodeRedeemFlow } from '../../src/renderer/components/auth/setup-code/setup-code-redeem-flow';
import { usersGateway } from '../../src/renderer/lib/users/users-gateway';
import i18n from '../../src/renderer/i18n/config';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function enterCode(code: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Code d'installation"), code);
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
}

describe('SetupCodeRedeemFlow (code-first, two-step)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });
  afterEach(() => vi.restoreAllMocks());

  it('routes a first-onboarding code to the identity + password step', async () => {
    vi.spyOn(usersGateway, 'validateSetupCode').mockResolvedValue({
      role: 'secretary',
      needsIdentity: true,
    });
    renderWithClient(<SetupCodeRedeemFlow onClose={vi.fn()} />);

    await enterCode('A7K2-9FMP-3QRT');

    expect(await screen.findByLabelText('Nom complet')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
  });

  it('routes an already-onboarded (re-issued) code to the password-only recovery step', async () => {
    vi.spyOn(usersGateway, 'validateSetupCode').mockResolvedValue({
      role: 'secretary',
      needsIdentity: false,
    });
    renderWithClient(<SetupCodeRedeemFlow onClose={vi.fn()} />);

    await enterCode('B8L3-0GNQ-4RSU');

    expect(
      await screen.findByText(
        'Votre compte existe déjà. Choisissez un nouveau mot de passe pour y accéder à nouveau.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
  });

  it('shows the code error and stays on step 1 for an invalid code', async () => {
    vi.spyOn(usersGateway, 'validateSetupCode').mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'setup-code-invalid' }),
    );
    renderWithClient(<SetupCodeRedeemFlow onClose={vi.fn()} />);

    await enterCode('ZZZZ-ZZZZ-ZZZZ');

    expect(await screen.findByText("Code d'installation invalide")).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
  });
});

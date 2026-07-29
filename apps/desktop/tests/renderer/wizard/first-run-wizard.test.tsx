import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstRunWizard } from '../../../src/renderer/components/wizard/first-run-wizard';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

function renderWizard(onComplete = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FirstRunWizard onComplete={onComplete} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useWizardStore.setState({ state: null, adminUsername: '' });
  usePlanStore.getState().setPlan('essentiel');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FirstRunWizard — French walk-through (Essentiel)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('walks every mandatory step to Done and creates the admin account once', async () => {
    const invoke = vi.fn().mockResolvedValue({ id: 'adm_00000000000000000000000001' });
    window.api.invoke = invoke;
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWizard(onComplete);

    // 1. Language
    expect(screen.getByText('Choisissez la langue')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    // 2. Center profile (stub)
    expect(await screen.findByText('Profil du centre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    // 3. Admin account (real)
    expect(await screen.findByText('Compte administrateur')).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'directeur');
    await user.type(screen.getByLabelText('Mot de passe'), 'Motdepasse1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin.create', {
        username: 'directeur',
        password: 'Motdepasse1',
      }),
    );
    expect(invoke).toHaveBeenCalledTimes(1);

    // 4. Hours (stub) -> Done
    expect(await screen.findByText("Horaires d'ouverture")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(await screen.findByText('Configuration terminée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not offer a Skip button on any mandatory step', async () => {
    window.api.invoke = vi.fn();
    expect(useWizardStore.getState().state).toBeNull();
    renderWizard();

    // language, then profile, then hours are all mandatory — none may be skipped.
    expect(screen.getByText('Choisissez la langue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();
  });

  it('retains the admin username across a Back → Continue round trip', async () => {
    window.api.invoke = vi.fn();
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // profile -> admin

    const username = await screen.findByLabelText("Nom d'utilisateur");
    await user.type(username, 'directeur');

    // Back to the center-profile step, then forward to the admin step again.
    await user.click(screen.getByRole('button', { name: 'Retour' })); // admin -> profile
    expect(await screen.findByText('Profil du centre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // profile -> admin

    // The remounted admin form rehydrates the previously typed username.
    expect(await screen.findByLabelText("Nom d'utilisateur")).toHaveValue('directeur');
  });

  it('blocks the admin step until valid data is entered (mandatory data cannot be bypassed)', async () => {
    const invoke = vi.fn();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // profile -> admin
    expect(await screen.findByText('Compte administrateur')).toBeInTheDocument();

    // Submit with empty fields: validation blocks the step, no IPC, still on admin.
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(
      await screen.findByText('Le mot de passe doit contenir au moins 8 caractères'),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText('Compte administrateur')).toBeInTheDocument();
  });
});

describe('FirstRunWizard — Holidays gating (Pro)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
    usePlanStore.getState().setPlan('pro');
    window.api.invoke = vi.fn().mockResolvedValue({ id: 'adm_1' });
  });

  it('offers a Skip button on the optional Holidays step', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // profile
    await user.type(await screen.findByLabelText("Nom d'utilisateur"), 'directeur');
    await user.type(screen.getByLabelText('Mot de passe'), 'Motdepasse1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // admin
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // hours -> holidays

    expect(await screen.findByRole('heading', { name: 'Jours fériés' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer' })).toBeInTheDocument();
  });
});

describe('FirstRunWizard — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('renders the first step and controls in Arabic', () => {
    window.api.invoke = vi.fn();
    renderWizard();
    expect(screen.getByText('اختر اللغة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'متابعة' })).toBeInTheDocument();
  });
});

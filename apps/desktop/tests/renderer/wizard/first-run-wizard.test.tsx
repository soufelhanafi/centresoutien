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

/**
 * Stateful stub of the preload bridge for the channels the wizard touches. It
 * remembers the saved center (so the real Center Profile step re-hydrates on
 * Back) and answers `admin.create`. Default center hours are seeded in the
 * domain at center creation (SOU-235), so the wizard no longer touches
 * `centerHours.*` or `holiday.*`.
 */
function stubApi() {
  let savedCenter: Record<string, unknown> | null = null;
  return vi.fn().mockImplementation((channel: string, req: Record<string, unknown>) => {
    switch (channel) {
      case 'center.get':
        return Promise.resolve({ center: savedCenter });
      case 'center.save':
        savedCenter = { ...req, logoPath: req.logoPath ?? null, plan: 'essentiel' };
        return Promise.resolve({ center: savedCenter });
      case 'admin.create':
        return Promise.resolve({ id: 'adm_00000000000000000000000001' });
      default:
        return Promise.resolve({});
    }
  });
}

/** Fill the mandatory Center Profile fields (name + valid phone). */
async function fillCenter(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Nom du centre'), 'Centre principal');
  await user.type(screen.getByLabelText('Téléphone'), '+212612345678');
}

/** Fill the mandatory Admin Account fields with valid credentials. */
async function fillAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Nom d'utilisateur"), 'directeur');
  await user.type(screen.getByLabelText('Mot de passe'), 'Motdepasse1');
  await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Motdepasse1');
}

beforeEach(() => {
  // These walk-throughs target the create-center step machine directly; the
  // mode-choice gate (SOU-318) is covered in its own spec.
  useWizardStore.setState({ mode: 'create', state: null, adminUsername: '' });
  usePlanStore.getState().setPlan('essentiel');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FirstRunWizard — French walk-through', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('walks language → center-profile → admin-account → Done and creates the admin account once', async () => {
    const invoke = stubApi();
    window.api.invoke = invoke;
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWizard(onComplete);

    // 1. Language
    expect(screen.getByText('Choisissez la langue')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile

    // 2. Center Profile
    expect(await screen.findByText('Profil du centre')).toBeInTheDocument();
    await fillCenter(user);
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // profile -> admin

    // 3. Admin Account
    expect(await screen.findByText('Compte administrateur')).toBeInTheDocument();
    await fillAdmin(user);
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // admin -> done

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin.create', {
        username: 'directeur',
        password: 'Motdepasse1',
      }),
    );
    // The center row is persisted before the admin account.
    expect(invoke).toHaveBeenCalledWith('center.save', expect.objectContaining({ name: 'Centre principal' }));
    expect(invoke.mock.calls.filter((call) => call[0] === 'admin.create')).toHaveLength(1);

    // Completing the admin step ends the run — no hours/holidays steps remain.
    expect(await screen.findByText('Configuration terminée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not offer a Skip button on any step (every step is mandatory)', async () => {
    window.api.invoke = stubApi();
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByText('Choisissez la langue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile
    expect(await screen.findByText('Profil du centre')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();

    await fillCenter(user);
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // profile -> admin
    expect(await screen.findByText('Compte administrateur')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();
  });

  it('retains the admin username across a Back → Continue round trip', async () => {
    window.api.invoke = stubApi();
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile
    await fillCenter(user);
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // profile -> admin

    const username = await screen.findByLabelText("Nom d'utilisateur");
    await user.type(username, 'directeur');

    // Back to the center-profile step, then forward to the admin step again. The
    // saved center row re-hydrates the fields, so Continue advances without re-entry.
    await user.click(screen.getByRole('button', { name: 'Retour' })); // admin -> profile
    expect(await screen.findByText('Profil du centre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' })); // profile -> admin

    // The remounted admin form rehydrates the previously typed username.
    expect(await screen.findByLabelText("Nom d'utilisateur")).toHaveValue('directeur');
  });

  it('blocks the admin step until valid data is entered (mandatory data cannot be bypassed)', async () => {
    const invoke = stubApi();
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Continuer' })); // language -> profile
    await fillCenter(user);
    await user.click(await screen.findByRole('button', { name: 'Continuer' })); // profile -> admin
    expect(await screen.findByText('Compte administrateur')).toBeInTheDocument();

    // Submit with empty fields: validation blocks the step, no admin created, still on admin.
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(
      await screen.findByText('Le mot de passe doit contenir au moins 8 caractères'),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('admin.create', expect.anything());
    expect(screen.getByText('Compte administrateur')).toBeInTheDocument();
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

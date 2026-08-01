import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PLANS } from '@centresoutien/domain';
import { SettingsPage } from '../../../src/renderer/pages/settings-page';
import { usePlanStore } from '../../../src/renderer/stores/plan-store';
import i18n from '../../../src/renderer/i18n/config';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  usePlanStore.setState({ planId: 'essentiel', plan: PLANS.essentiel });
});

describe('Settings page — tabs', () => {
  it('lists all six tabs in French and switches between password, language, and plan', async () => {
    await i18n.changeLanguage('fr');
    const user = userEvent.setup();
    renderPage();

    for (const label of ['Profil', 'Horaires', 'Vacances', 'Mot de passe', 'Langue', 'Formule']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('tab', { name: 'Mot de passe' }));
    expect(await screen.findByText('Changer le mot de passe')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Langue' }));
    expect(await screen.findByRole('button', { name: 'Français' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Formule' }));
    expect(await screen.findByText('Votre formule')).toBeInTheDocument();
  });

  it('lists all six tabs in Arabic', async () => {
    await i18n.changeLanguage('ar');
    renderPage();

    for (const label of ['الملف الشخصي', 'المواعيد', 'العطل', 'كلمة المرور', 'اللغة', 'الباقة']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    await i18n.changeLanguage('fr');
  });
});

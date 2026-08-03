import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CenterProfileStep } from '../../../src/renderer/components/wizard/steps/center-profile-step';
import { useWizardStore } from '../../../src/renderer/stores/wizard-store';
import i18n from '../../../src/renderer/i18n/config';

function renderStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CenterProfileStep />
    </QueryClientProvider>,
  );
}

/** Fill the mandatory fields (name + valid phone) so the form can be submitted. */
async function fillCenter(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Nom du centre'), 'Centre principal');
  await user.type(screen.getByLabelText('Téléphone'), '+212612345678');
}

beforeEach(() => {
  useWizardStore.setState({ state: null, adminUsername: '' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CenterProfileStep — load error (French)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('shows the alert and a Retry affordance when center.get fails, then recovers on retry', async () => {
    let getCalls = 0;
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'center.get') {
        getCalls += 1;
        return getCalls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ center: null });
      }
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const user = userEvent.setup();
    renderStep();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Le chargement du profil du centre a échoué.');

    const retry = screen.getByRole('button', { name: 'Réessayer' });
    await user.click(retry);

    await waitFor(() => expect(getCalls).toBe(2));
    expect(await screen.findByLabelText('Nom du centre')).toBeInTheDocument();
  });
});

describe('CenterProfileStep — save error (French)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('surfaces the alert banner and does not advance the step when center.save fails', async () => {
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'center.get') return Promise.resolve({ center: null });
      if (channel === 'center.save') return Promise.reject(new Error('save failed'));
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const submit = vi.fn();
    useWizardStore.setState({ submit });
    const user = userEvent.setup();
    renderStep();

    await fillCenter(user);
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("L'enregistrement du profil a échoué. Réessayez.");

    expect(submit).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('admin.create', expect.anything());
    expect(screen.getByLabelText('Nom du centre')).toHaveValue('Centre principal');
  });
});

describe('CenterProfileStep — Arabic (RTL)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('shows the load-error alert and Retry button in Arabic', async () => {
    window.api.invoke = vi.fn().mockImplementation((channel: string) =>
      channel === 'center.get' ? Promise.reject(new Error('offline')) : Promise.resolve({}),
    );
    renderStep();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('فشل تحميل ملف المركز.');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });

  it('shows the save-error alert in Arabic and keeps the user on the step', async () => {
    const invoke = vi.fn().mockImplementation((channel: string) => {
      if (channel === 'center.get') return Promise.resolve({ center: null });
      if (channel === 'center.save') return Promise.reject(new Error('save failed'));
      return Promise.resolve({});
    });
    window.api.invoke = invoke;
    const submit = vi.fn();
    useWizardStore.setState({ submit });
    const user = userEvent.setup();
    renderStep();

    await user.type(await screen.findByLabelText('اسم المركز'), 'مركز النجاح');
    await user.type(screen.getByLabelText('الهاتف'), '+212612345678');
    await user.click(screen.getByRole('button', { name: 'متابعة' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('فشل حفظ الملف. حاول مرة أخرى.');
    expect(submit).not.toHaveBeenCalled();
  });
});
